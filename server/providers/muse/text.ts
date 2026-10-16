import type { Item, SessionStartResult, TurnCompletedParams } from "@muse-code/sdk/dist/src/msp.js";
import type { ProviderLaunch } from "../types.ts";
import { MUSE_PROVIDER, MuseHost, unreadable } from "./host.ts";

export async function generateMuseText(
  cwd: string,
  model: string,
  effort: string | undefined,
  prompt: string,
  signal: AbortSignal,
  launch: ProviderLaunch,
): Promise<string> {
  const host = await MuseHost.start({ launch, cwd, access: "readOnly", sessionLog: false });
  const abort = () => void host.close();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const sessionId = host.connection.mintCommandId();
    const replies = new Map<string, string>();
    let settle!: (params: TurnCompletedParams) => void;
    const completed = new Promise<TurnCompletedParams>((resolve) => {
      settle = resolve;
    });
    host.connection.onNotification(({ method, params }) => {
      const event = (params ?? {}) as { sessionId?: string; item?: Item };
      if (event.sessionId !== sessionId) return;
      if (method === "item/completed" && event.item?.kind === "agentMessage")
        replies.set(event.item.itemId, event.item.text ?? "");
      if (method === "turn/completed") settle(params as unknown as TurnCompletedParams);
    });
    let reject!: (error: Error) => void;
    const failed = new Promise<never>((_, fail) => {
      reject = fail;
    });
    host.connection.onProtocolError((error) => reject(new Error(unreadable(error))));
    host.connection.onServerRequest(async (request) => {
      const error = new Error(
        `Muse Code asked for ${request.method} while writing text, which needs no tools.`,
      );
      reject(error);
      throw error;
    });
    void host.exited.then(() =>
      reject(new Error(host.stderr() || "Muse Code exited before finishing.")),
    );
    await Promise.race([
      host.command<SessionStartResult>("session/start", {
        sessionId,
        workspaceRoot: cwd,
        providerId: MUSE_PROVIDER,
        approvalMode: "denyUnmatched",
        modelId: model,
      }),
      failed,
    ]);
    await Promise.race([
      host.command("turn/start", {
        sessionId,
        input: [{ type: "text", text: prompt }],
        ...(effort ? { reasoningEffort: effort } : {}),
      }),
      failed,
    ]);
    const result = await Promise.race([completed, failed]);
    if (result.terminal !== "completed")
      throw new Error(
        result.error?.message ??
          result.reason ??
          `Muse Code stopped before finishing (${result.terminal}).`,
      );
    const reply = [...replies.values()].at(-1);
    if (reply === undefined) throw new Error("Muse Code returned no reply.");
    return reply;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    await host.close();
  }
}
