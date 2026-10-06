import { createHash } from "node:crypto";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { join, relative, isAbsolute, sep } from "node:path";
import { createInterface } from "node:readline";
import { store } from "./store.ts";
import { providerLogRoots } from "./provider-logs.ts";
import { uid } from "./ids.ts";
import { ifMissing } from "../shared/expected-errors.mjs";
import { workspaceDirectory } from "./remote.ts";
import { isProviderId, type Message, type Part, type ToolPart } from "../shared/protocol.ts";
import type { ImportableSession, ImportProvider } from "../shared/session-import.ts";

const candidates = new Map<string, { provider: ImportProvider; path: string; root: string; sessionId?: string }>();
const limit = 32 * 1024 * 1024;

async function* records(path: string, root: string, metadata = false): AsyncGenerator<any> {
  const canonical = await realpath(path);
  const base = await realpath(root);
  const rel = relative(base, canonical);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error("Session is outside the provider history folder.");
  const file = await open(canonical, "r");
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Session is not a file.");
    if (!metadata && info.size > limit) throw new Error("This session exceeds the 32 MB import limit.");
    const stream = file.createReadStream({ autoClose: false, end: metadata ? 256 * 1024 - 1 : limit - 1 });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;
    let unreadableLine: number | undefined;
    try {
      for await (const line of lines) {
        lineNumber++;
        if (!line.trim()) continue;
        if (unreadableLine !== undefined) throw new Error(`Line ${unreadableLine} of ${path} is not valid JSON.`);
        let record: unknown;
        try { record = JSON.parse(line); } catch { unreadableLine = lineNumber; continue; }
        yield record;
      }
    } finally { lines.close(); stream.destroy(); }
  } finally { await file.close(); }
}

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(item => ["text", "input_text", "output_text"].includes(item?.type) && typeof item.text === "string").map(item => item.text).join("\n");
}

async function openCodeSession(path: string, sessionId: string) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const session = db.prepare("SELECT id, directory, title, model, time_updated, parent_id FROM session WHERE id = ?").get(sessionId) as Record<string, any> | undefined;
    if (!session || session.parent_id || !isAbsolute(session.directory)) return null;
    const modelInfo = session.model ? JSON.parse(session.model) : undefined;
    let model = modelInfo?.providerID && modelInfo?.id ? `${modelInfo.providerID}/${modelInfo.id}` : undefined;
    const messages: Message[] = [];
    const size = db.prepare("SELECT (SELECT coalesce(sum(length(data)), 0) FROM message WHERE session_id = ?) + (SELECT coalesce(sum(length(data)), 0) FROM part WHERE session_id = ?) AS bytes").get(sessionId, sessionId) as { bytes: number };
    if (size.bytes > limit) throw new Error("This session exceeds the 32 MB import limit.");
    const rows = db.prepare("SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created, id").all(sessionId) as Array<{ id: string; data: string; time_created: number }>;
    const parts = db.prepare("SELECT message_id, data, time_created FROM part WHERE session_id = ? ORDER BY time_created, id").all(sessionId) as Array<{ message_id: string; data: string; time_created: number }>;
    const byMessage = new Map<string, typeof parts>();
    for (const part of parts) {
      const entries = byMessage.get(part.message_id) ?? [];
      entries.push(part);
      byMessage.set(part.message_id, entries);
    }
    for (const row of rows) {
      const data = JSON.parse(row.data);
      if (data.role !== "user" && data.role !== "assistant") continue;
      if (data.role === "assistant" && typeof data.providerID === "string" && typeof data.modelID === "string") model = `${data.providerID}/${data.modelID}`;
      const content: Part[] = [];
      for (const entry of byMessage.get(row.id) ?? []) {
        const part = JSON.parse(entry.data);
        if (part.type === "text" && typeof part.text === "string") content.push({ id: uid("prt"), kind: "text", text: part.text, complete: true });
        else if (part.type === "reasoning" && typeof part.text === "string") content.push({ id: uid("prt"), kind: "reasoning", text: part.text, complete: true });
        else if (part.type === "tool" && typeof part.callID === "string") content.push({ id: uid("prt"), kind: "tool", callId: part.callID, name: part.tool || "Tool", headline: part.state?.title || part.tool || "Tool", shape: "generic", input: part.state?.input, status: part.state?.status === "error" ? "error" : "ok", output: typeof part.state?.output === "string" ? part.state.output : part.state?.output === undefined ? undefined : JSON.stringify(part.state.output), startedAt: part.state?.time?.start ?? entry.time_created, endedAt: part.state?.time?.end });
        else if (part.type === "file" || part.type === "image") content.push({ id: uid("prt"), kind: "text", text: "[Attachment in original provider session]", complete: true });
      }
      if (content.length) messages.push({ id: uid("msg"), role: data.role, ts: data.time?.created ?? row.time_created, parts: content, ...(data.role === "assistant" ? { provider: "opencode", model } : {}) });
    }
    return { sessionId, cwd: session.directory as string, title: session.title || "Imported conversation", model, updatedAt: session.time_updated as number, messages };
  } finally { db.close(); }
}

async function listOpenCodeSessions(): Promise<ImportableSession[]> {
  const path = providerLogRoots("opencode")[0]!;
  if (!await stat(path).catch(ifMissing(null))) return [];
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path, { readOnly: true });
  let sessions: Array<{ id: string; directory: string; title: string; time_updated: number }>;
  try { sessions = db.prepare("SELECT id, directory, title, time_updated FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT 200").all() as typeof sessions; }
  finally { db.close(); }
  const output: ImportableSession[] = [];
  for (const session of sessions) {
    if (!isAbsolute(session.directory)) continue;
    const id = createHash("sha256").update(`opencode:${path}:${session.id}`).digest("hex");
    candidates.set(id, { provider: "opencode", path, root: path, sessionId: session.id });
    const imported = [...store.threads.values()].find(thread => thread.provider === "opencode" && thread.externalId === session.id);
    output.push({ id, provider: "opencode", sessionId: session.id, title: session.title || "Imported conversation", cwd: session.directory, updatedAt: session.time_updated, importedThreadId: imported?.id });
  }
  return output;
}

async function readSession(path: string, root: string, provider: ImportProvider, metadata = false) {
  let sessionId = "", cwd = "", title = "", model: string | undefined;
  const messages: Message[] = [];
  const seen = new Set<string>();
  const tools = new Map<string, ToolPart>();
  for await (const row of records(path, root, metadata)) {
    if (provider === "claude" && row.isSidechain) continue;
    if (provider === "claude") {
      if (typeof row.sessionId === "string") sessionId ||= row.sessionId;
      if (typeof row.cwd === "string") cwd ||= row.cwd;
      if (row.type === "custom-title" && typeof row.customTitle === "string") title = row.customTitle;
    } else if (provider === "codex" && row.type === "session_meta") {
      sessionId = row.payload?.id || row.payload?.session_id || "";
      cwd = row.payload?.cwd || "";
      if (row.payload?.parent_thread_id || typeof row.payload?.source === "object" && row.payload.source?.subagent) return null;
    }
    if (provider === "codex" && row.type === "turn_context" && typeof row.payload?.model === "string") model = row.payload.model;
    const payload = provider === "claude" ? row.message : row.type === "response_item" ? row.payload : undefined;
    if (!payload) continue;
    if (typeof payload.model === "string") model = payload.model;
    const timestamp = typeof payload.timestamp === "number" ? payload.timestamp : Date.parse(row.timestamp) || Date.now();
    if (provider === "codex" && ["function_call_output", "custom_tool_call_output"].includes(payload.type)) {
      const tool = tools.get(payload.call_id);
      if (tool) { tool.output = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output); tool.status = "ok"; tool.endedAt = timestamp; }
      continue;
    }
    const content = provider === "codex" && ["function_call", "custom_tool_call"].includes(payload.type)
      ? [{ type: "tool_use", id: payload.call_id, name: payload.name, input: payload.arguments ?? payload.input }]
      : payload.content;
    const role = payload.role || (payload.type === "function_call" || payload.type === "custom_tool_call" ? "assistant" : undefined);
    if (role !== "user" && role !== "assistant") continue;
    const identity = row.uuid || payload.id;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    const body = text(content);
    if (role === "user" && body && !body.startsWith("# AGENTS.md") && !body.startsWith("<environment_context>")) title ||= (body.split("\n")[0] || "").slice(0, 100);
    if (metadata) continue;
    const parts: Part[] = [];
    if (body) parts.push({ id: uid("prt"), kind: "text", text: body, complete: true });
    if (Array.isArray(content)) for (const block of content) {
      if (block.type === "tool_use" && typeof block.id === "string") {
        const tool: ToolPart = { id: uid("prt"), kind: "tool", callId: block.id, name: String(block.name || "Tool"), headline: String(block.name || "Tool"), shape: "generic", input: block.input, status: "ok", startedAt: timestamp };
        tools.set(block.id, tool);
        parts.push(tool);
      } else if (block.type === "tool_result") {
        const tool = tools.get(block.tool_use_id);
        if (tool) { tool.output = text(block.content); tool.status = block.is_error ? "error" : "ok"; tool.endedAt = timestamp; }
      } else if (block.type === "thinking" && typeof block.thinking === "string") parts.push({ id: uid("prt"), kind: "reasoning", text: block.thinking, complete: true });
      else if (["image", "input_image", "document"].includes(block.type)) parts.push({ id: uid("prt"), kind: "text", text: "[Attachment in original provider session]", complete: true });
    }
    if (parts.length) messages.push({ id: uid("msg"), role, ts: timestamp, parts, ...(role === "assistant" ? { provider, model } : {}) });
  }
  if (typeof sessionId !== "string" || !sessionId || typeof cwd !== "string" || !isAbsolute(cwd)) return null;
  return { sessionId, cwd, title: title || "Imported conversation", model, messages };
}

export async function listImportableSessions(provider: ImportProvider): Promise<ImportableSession[]> {
  if (!isProviderId(provider)) throw new Error("Choose a provider.");
  for (const [id, candidate] of candidates) if (candidate.provider === provider) candidates.delete(id);
  if (provider === "opencode") return listOpenCodeSessions();
  const files: { path: string; root: string; updatedAt: number }[] = [];
  async function scan(directory: string, root: string, depth: number): Promise<void> {
    if (depth > 4 || files.length >= 5000) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch(ifMissing([]));
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "subagents") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path, root, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const info = await stat(path).catch(ifMissing(null));
        if (info) files.push({ path, root, updatedAt: info.mtimeMs });
      }
      if (files.length >= 5000) break;
    }
  }
  for (const root of providerLogRoots(provider)) await scan(root, root, 0);
  const output: ImportableSession[] = [];
  const recent = files.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200);
  for (const file of recent) {
    const data = await readSession(file.path, file.root, provider, true);
    if (!data) continue;
    const id = createHash("sha256").update(`${provider}:${file.path}`).digest("hex");
    candidates.set(id, { ...file, provider });
    const imported = [...store.threads.values()].find(thread => thread.provider === provider && thread.externalId === data.sessionId);
    output.push({ id, provider, sessionId: data.sessionId, title: data.title, cwd: data.cwd, updatedAt: file.updatedAt, importedThreadId: imported?.id });
  }
  return output;
}

export async function importSession(id: string): Promise<{ threadId: string; projectId: string }> {
  const candidate = candidates.get(id);
  if (!candidate) throw new Error("Refresh the session list and choose a session again.");
  const session = candidate.provider === "opencode" ? await openCodeSession(candidate.path, candidate.sessionId!)
    : await readSession(candidate.path, candidate.root, candidate.provider);
  if (!session) throw new Error("This session has no supported conversation history.");
  const path = await workspaceDirectory(session.cwd);
  const existing = [...store.threads.values()].find(thread => thread.provider === candidate.provider && thread.externalId === session.sessionId);
  if (existing) return { threadId: existing.id, projectId: existing.projectId };
  if (store.disabledProviders.has(candidate.provider)) throw new Error("Enable this provider in Settings > Providers before importing.");
  const project = store.openProject(path);
  const thread = store.createThread({ projectId: project.id, provider: candidate.provider, externalId: session.sessionId, title: session.title, model: session.model, permissionMode: "manual" });
  store.replaceMessages(thread.id, session.messages);
  store.flush();
  return { threadId: thread.id, projectId: project.id };
}
