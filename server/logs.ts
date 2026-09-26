import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataRoot } from "./paths.ts";

export type LogLevel = "info" | "warn" | "error";

export const logFile = join(dataRoot, "logs", "citropy.log");
const MAX_BYTES = 1024 * 1024;
const MAX_MESSAGE = 4000;

let enabled = false;

export function setLogging(on: boolean): void {
  enabled = on;
}

export function writeLog(level: LogLevel, source: string, message: string): void {
  if (!enabled) return;
  const line = `${JSON.stringify({ time: new Date().toISOString(), level, source, message: message.slice(0, MAX_MESSAGE) })}\n`;
  mkdirSync(dirname(logFile), { recursive: true, mode: 0o700 });
  if (existsSync(logFile) && statSync(logFile).size + Buffer.byteLength(line) > MAX_BYTES) renameSync(logFile, `${logFile}.1`);
  appendFileSync(logFile, line, { mode: 0o600 });
}
