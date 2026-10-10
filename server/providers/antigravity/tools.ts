import type { ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk";
import { toolContent, type ToolContent } from "../tool-content.ts";

const FIELDS = {
  command: ["CommandLine", "command_line", "commandLine", "command"],
  cwd: ["Cwd", "WorkingDirectory", "working_dir", "workingDir", "cwd"],
  path: ["file_path", "filePath", "path"],
  pattern: ["query", "pattern"],
  url: ["url"],
  prompt: ["prompt", "task", "description"],
  output: ["combinedOutput", "combined_output", "output"],
  exitCode: ["exitCode", "exit_code"],
};
const SUBAGENT_TOOL = "start_subagent";

export type ToolState = Omit<ToolCall, "title"> & { title?: string | null };

export function mergeTool(previous: ToolState | undefined, update: ToolCall | ToolCallUpdate): ToolState {
  const merged: ToolState = { ...previous, toolCallId: update.toolCallId };
  for (const [key, value] of Object.entries(update)) if (value != null) Object.assign(merged, { [key]: value });
  return merged;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function field(source: Record<string, unknown>, names: string[]): unknown {
  return names.map(name => source[name]).find(value => value !== undefined && value !== null && value !== "");
}

function text(source: Record<string, unknown>, names: string[]): string | undefined {
  const value = field(source, names);
  return typeof value === "string" ? value : undefined;
}

export function isSubagent(tool: ToolState): boolean {
  return Boolean(tool.title?.includes(SUBAGENT_TOOL) || tool.name === SUBAGENT_TOOL);
}

export function describeTool(tool: ToolState): { name: string; input: Record<string, unknown> } {
  const raw = record(tool.rawInput);
  const diff = tool.content?.find(entry => entry.type === "diff");
  const path = tool.locations?.[0]?.path ?? diff?.path ?? text(raw, FIELDS.path) ?? "";
  const title = tool.title ?? tool.name ?? "Tool";
  if (isSubagent(tool)) return { name: "Task", input: { description: text(raw, FIELDS.prompt) ?? title } };
  switch (tool.kind) {
    case "execute": return { name: "Bash", input: { command: text(raw, FIELDS.command) ?? title, cwd: text(raw, FIELDS.cwd) } };
    case "edit": return { name: diff && !diff.oldText ? "Write" : "Edit", input: { file_path: path } };
    case "delete":
    case "move": return { name: "Edit", input: { file_path: path, description: title } };
    case "read": return { name: "Read", input: { file_path: path } };
    case "search": return { name: "Grep", input: { pattern: text(raw, FIELDS.pattern) ?? title, path } };
    case "fetch": return { name: "WebFetch", input: { url: text(raw, FIELDS.url) ?? title } };
    default: return { name: title, input: raw };
  }
}

export function toolResult(tool: ToolState): ToolContent & { ok: boolean } {
  const raw = record(tool.rawOutput);
  const exitCode = field(raw, FIELDS.exitCode);
  const output = text(raw, FIELDS.output);
  const content = toolContent((tool.content ?? []).flatMap((entry): unknown[] =>
    entry.type === "content" ? [entry.content] : entry.type === "diff" ? [entry.path] : []));
  return {
    text: output ?? content.text,
    images: content.images,
    ok: tool.status !== "failed" && (exitCode === undefined || exitCode === 0),
  };
}
