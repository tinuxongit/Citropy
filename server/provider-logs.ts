import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ifMissing } from "../shared/expected-errors.mjs";
import type { ImportProvider } from "../shared/session-import.ts";
import { claudeHome, codexHome } from "./providers/config-folders.ts";

export function providerLogRoots(provider: ImportProvider): string[] {
  if (provider === "claude") return [join(claudeHome(), "projects")];
  if (provider === "codex") return ["sessions", "archived_sessions"].map(folder => join(codexHome(), folder));
  const data = process.env.XDG_DATA_HOME || (process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : process.platform === "win32" ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : join(homedir(), ".local", "share"));
  return [join(data, "opencode", "opencode.db")];
}

export async function openOpenCodeDatabase(): Promise<DatabaseSync | undefined> {
  const path = providerLogRoots("opencode")[0]!;
  if (!await stat(path).catch(ifMissing(null))) return undefined;
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(path, { readOnly: true });
}
