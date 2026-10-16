import { appendFileSync, chmodSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { logFailure } from "../shared/expected-errors.mjs";
import { join } from "node:path";

export interface DiagnosticDetails {
  version?: string;
  electron?: string;
  platform?: string;
  packaged?: boolean;
  threadId?: number;
  code?: number | null;
  signal?: string | null;
  reason?: string;
  type?: string;
}

export function desktopDiagnostics(directory: string) {
  const file = join(directory, "desktop.log");
  return (
    event: string,
    {
      version,
      electron,
      platform,
      packaged,
      threadId,
      code,
      signal,
      reason,
      type,
    }: DiagnosticDetails = {},
  ) => {
    try {
      const line = `${JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event, version, electron, platform, packaged, threadId, code, signal, reason, type })}\n`;
      const bytes = Buffer.byteLength(line);
      if (bytes > 4096) return;
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (existsSync(file)) {
        chmodSync(file, 0o600);
        if (statSync(file).size + bytes > 128 * 1024) renameSync(file, `${file}.1`);
      }
      appendFileSync(file, line, { mode: 0o600 });
    } catch (error) {
      logFailure("Writing desktop diagnostics", file)(error);
    }
  };
}
