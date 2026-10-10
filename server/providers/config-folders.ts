import { homedir } from "node:os";
import { join } from "node:path";

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function codexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}
