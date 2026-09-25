import * as acp from "@agentclientprotocol/sdk";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { stopProcess } from "./process.ts";
import { spawnCommand } from "./binary.ts";
import type { PermissionMode } from "../../shared/protocol.ts";
import type { ProviderLaunch } from "./types.ts";
import type { ProviderCommand } from "../../shared/features.ts";
import packageInfo from "../../package.json" with { type: "json" };

export interface AcpConfig {
  label: string;
  binary: string;
  args: string[];
  loginCommand: string;
  modes: Record<PermissionMode, string>;
  parameterizedModelPicker?: boolean;
  modelListing?: string;
  onCommands?: (cwd: string, commands: ProviderCommand[]) => void;
}

const clientInfo = { name: "citropy", version: packageInfo.version } satisfies acp.Implementation;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    timer.unref();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(errorMessage(error))); },
    );
  });
}

export function signedOut(config: AcpConfig, error: unknown): Error {
  if (error instanceof acp.RequestError && error.code === -32000)
    return new Error(`${config.label} is not signed in. Run \`${config.loginCommand}\` in a terminal, then try again.`);
  return error instanceof Error ? error : new Error(errorMessage(error));
}

export function spawnAgent(config: AcpConfig, cwd: string, launch?: ProviderLaunch): { child: ChildProcessWithoutNullStreams; stream: acp.Stream } {
  const child = spawnCommand(launch?.binary ?? config.binary, config.args, {
    detached: process.platform !== "win32",
    cwd,
    env: { ...process.env, ...launch?.environment, NO_COLOR: "1", TERM: "dumb" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
  );
  return { child, stream };
}

export async function initializeAgent(agent: acp.ClientContext, config: AcpConfig): Promise<acp.InitializeResponse> {
  const init = await withTimeout(
    agent.request<acp.InitializeResponse, acp.InitializeRequest>(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        ...(config.parameterizedModelPicker ? { _meta: { parameterizedModelPicker: true } } : {}),
      },
      clientInfo,
    }),
    30_000,
    `${config.label} did not answer the ACP handshake within 30 seconds`,
  );
  if (init.protocolVersion !== acp.PROTOCOL_VERSION)
    throw new Error(`${config.label} speaks ACP version ${init.protocolVersion}; this Citropy build supports version ${acp.PROTOCOL_VERSION}.`);
  return init;
}

export function closeAgent(connection: acp.ClientConnection, child: ChildProcessWithoutNullStreams): void {
  connection.close();
  child.stdin.end();
  stopProcess(child, true);
}
