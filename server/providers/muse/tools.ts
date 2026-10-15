import type { Item } from "@muse-code/sdk/dist/src/msp.js";

const TOOL_NAMES: Record<string, string> = {
  shell: "Bash",
  bash: "Bash",
  exec_command: "Bash",
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  apply_patch: "Edit",
  grep: "Grep",
  glob: "Glob",
  web_search: "WebSearch",
  web_fetch: "WebFetch",
  subagent: "Task",
};

const ARGUMENTS: Record<string, string[]> = {
  file_path: ["file_path", "filePath", "path", "file"],
  old_string: ["old_string", "old_str", "oldStr", "oldText"],
  new_string: ["new_string", "new_str", "newStr", "newText"],
  content: ["content", "contents"],
  command: ["command", "cmd"],
  cwd: ["cwd", "workdir", "working_dir"],
  pattern: ["pattern", "query", "glob"],
  query: ["query", "q"],
  url: ["url"],
  description: ["description", "objective", "prompt", "task"],
};

const NATIVE_ROWS = new Set(["write_todos", "request_user_input", "workflow"]);

export interface MuseTool {
  name: string;
  input: Record<string, unknown>;
}

function parseArgs(args: string | undefined): Record<string, unknown> {
  if (!args) return {};
  try {
    const parsed: unknown = JSON.parse(args);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { arguments: parsed };
  } catch {
    // Why: Muse streams model-written arguments, so they are not valid JSON until the call settles.
    return { arguments: args };
  }
}

function canonical(raw: Record<string, unknown>): Record<string, unknown> {
  const input = { ...raw };
  for (const [key, aliases] of Object.entries(ARGUMENTS)) {
    const value = aliases.map(alias => raw[alias]).find(entry => entry !== undefined && entry !== null && entry !== "");
    if (value !== undefined) input[key] = Array.isArray(value) && value.every(part => typeof part === "string") ? value.join(" ") : value;
  }
  return input;
}

export function hasNativeRow(item: Item): boolean {
  return item.kind === "toolCall" && NATIVE_ROWS.has(item.tool ?? "") && item.status !== "failed";
}

export function museTool(item: Item): MuseTool {
  if (item.kind === "userShell") return { name: "Bash", input: { command: item.commandText ?? "" } };
  if (item.kind === "workflow") return { name: "Task", input: { description: item.entryId ?? item.fallbackText ?? "Workflow" } };
  return toolCall(item.tool ?? item.kind, item.args);
}

export function toolCall(tool: string, args: string | undefined): MuseTool {
  return { name: TOOL_NAMES[tool] ?? tool, input: canonical(parseArgs(args)) };
}

export function itemOk(item: Item): boolean {
  if (item.status !== "completed") return false;
  if (item.kind === "compaction") return !item.outcome || item.outcome === "compacted";
  return item.exitCode === undefined || item.exitCode === 0;
}

export function itemOutput(item: Item): string {
  const text = item.visibleOutput ?? item.result?.summary ?? item.finalSummary ?? item.text ?? item.fallbackText ?? "";
  const failure = item.status === "completed" ? undefined : item.failureReason ?? `Muse Code reported ${item.status}.`;
  return [failure, text].filter(Boolean).join("\n");
}
