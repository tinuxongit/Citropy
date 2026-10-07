import { realpath } from "node:fs/promises";
import { ifMissing } from "../../shared/expected-errors.mjs";

const MAX_EVENT_BUFFER = 8 * 1024 * 1024;

export async function readServerEvents(response: Response, handle: (event: unknown) => void): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error("OpenCode event stream closed");
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_EVENT_BUFFER) throw new Error("OpenCode event stream exceeded its 8 MB buffer.");
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop()!;
      for (const frame of frames) {
        const payload = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
        if (payload) handle(JSON.parse(payload));
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function sameDirectory(first: string, second: string): Promise<boolean> {
  const [a, b] = await Promise.all([realpath(first).catch(ifMissing(first)), realpath(second).catch(ifMissing(second))]);
  return a === b;
}

export function parseModelRef(model: string | undefined): { providerID: string; modelID: string } {
  const [providerID, ...modelParts] = model?.split("/") ?? [];
  if (!providerID || !modelParts.length) throw new Error("Select an OpenCode model with a provider.");
  return { providerID, modelID: modelParts.join("/") };
}
