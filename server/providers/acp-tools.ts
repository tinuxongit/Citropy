import type * as acp from "@agentclientprotocol/sdk";
import { basename } from "node:path";
import { diffLines } from "../diff.ts";
import type { FilePatch } from "../../shared/protocol.ts";

export type ToolCallLike = acp.ToolCall | acp.ToolCallUpdate;
type ToolContent = Array<acp.ToolCallContent> | null | undefined;

export function toolReading(call: ToolCallLike): { name: string; input: unknown } {
  const raw = (call.rawInput ?? {}) as Record<string, unknown>;
  const path = call.locations?.[0]?.path ?? (typeof raw.path === "string" ? raw.path : "");
  switch (call.kind ?? "other") {
    case "execute":
      return { name: "Bash", input: { command: typeof raw.command === "string" ? raw.command : call.title } };
    case "edit":
    case "delete":
    case "move":
      return { name: "Edit", input: { file_path: path } };
    case "read":
      return { name: "Read", input: { file_path: path } };
    case "search":
      return { name: "Grep", input: { pattern: typeof raw.pattern === "string" ? raw.pattern : call.title } };
    case "fetch":
      return { name: "WebFetch", input: { url: typeof raw.url === "string" ? raw.url : call.title } };
    default:
      if (typeof raw.providerIdentifier === "string" && typeof raw.toolName === "string")
        return { name: `mcp__${raw.providerIdentifier}__${raw.toolName}`, input: raw.args ?? {} };
      return { name: call.name ?? call.title ?? "Tool", input: call.rawInput ?? {} };
  }
}

function rawOutputText(rawOutput: unknown): string | undefined {
  if (rawOutput === undefined || rawOutput === null) return undefined;
  if (typeof rawOutput === "string") return rawOutput;
  if (typeof rawOutput !== "object" || Array.isArray(rawOutput)) return JSON.stringify(rawOutput);
  const output = rawOutput as Record<string, unknown>;
  if (typeof output.stdout === "string" || typeof output.stderr === "string") {
    const stdout = typeof output.stdout === "string" ? output.stdout : "";
    const stderr = typeof output.stderr === "string" ? output.stderr : "";
    let text = stdout;
    if (stderr) text += `${text ? "\n" : ""}${stderr}`;
    if (typeof output.exitCode === "number" && output.exitCode !== 0) text += `${text ? "\n" : ""}[exit code ${output.exitCode}]`;
    return text;
  }
  if (typeof output.content === "string") return output.content;
  if (typeof output.totalMatches === "number") return `${output.totalMatches} matches${output.truncated === true ? " (truncated)" : ""}`;
  return JSON.stringify(rawOutput);
}

export function diffPatch(content: ToolContent): FilePatch | undefined {
  for (const block of content ?? []) {
    if (block.type !== "diff") continue;
    let oldText = block.oldText ?? "";
    let newText = block.newText;
    if (/^-- \/dev\/null$/.test(oldText.trim())) oldText = "";
    const lines = newText.split("\n");
    if (lines[0] !== undefined && /^\+\+ b\//.test(lines[0])) newText = lines.slice(1).join("\n");
    const patch = diffLines(oldText, newText, basename(block.path));
    if (patch.added > 0 || patch.removed > 0) return patch;
  }
  return undefined;
}

export function contentText(content: ToolContent, rawOutput?: unknown, skipDiff = false): string {
  const parts: string[] = [];
  for (const block of content ?? []) {
    if (block.type === "content" && block.content.type === "text") parts.push(block.content.text);
    else if (block.type === "diff") { if (!skipDiff) parts.push(`${block.path}\n${block.newText}`); }
    else if (block.type === "terminal") parts.push(block.terminalId);
  }
  const text = rawOutputText(rawOutput);
  if (text) parts.push(text);
  return parts.join("\n");
}

export function contentImages(content: ToolContent): Array<{ mime: string; data: string }> {
  const images: Array<{ mime: string; data: string }> = [];
  for (const block of content ?? []) {
    if (block.type === "content" && block.content.type === "image" && typeof block.content.data === "string" && typeof block.content.mimeType === "string")
      images.push({ mime: block.content.mimeType, data: block.content.data });
  }
  return images;
}

export function pickOption(options: acp.PermissionOption[], decision: "allow" | "allow_always" | "deny"): string | undefined {
  const order = decision === "deny"
    ? ["reject_once", "reject_always"]
    : decision === "allow_always"
      ? ["allow_always", "allow_once"]
      : ["allow_once", "allow_always"];
  for (const kind of order) {
    const option = options.find((entry) => entry.kind === kind);
    if (option) return option.optionId;
  }
  return undefined;
}
