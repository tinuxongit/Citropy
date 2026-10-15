import { homedir } from "node:os";
import { join } from "node:path";

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function codexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

export const MUSE_HOME_VARIABLE = "XDG_CONFIG_HOME";

export function museHome(environment: NodeJS.ProcessEnv = process.env): string {
  return join(environment[MUSE_HOME_VARIABLE] || join(homedir(), ".config"), "muse");
}
