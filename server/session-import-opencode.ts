import { isAbsolute } from "node:path";
import { uid } from "./ids.ts";
import { openOpenCodeDatabase } from "./provider-logs.ts";
import type { Message, Part } from "../shared/protocol.ts";
import { IMPORT_ATTACHMENT_NOTE, IMPORT_DEFAULT_TITLE, IMPORT_LIST_LIMIT, IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from "../shared/session-import.ts";

export async function listOpenCodeSessions(): Promise<Array<{ sessionId: string; title: string; cwd: string; updatedAt: number }>> {
  const db = await openOpenCodeDatabase();
  if (!db) return [];
  let sessions: Array<{ id: string; directory: string; title: string; time_updated: number }>;
  try { sessions = db.prepare("SELECT id, directory, title, time_updated FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT ?").all(IMPORT_LIST_LIMIT) as typeof sessions; }
  finally { db.close(); }
  return sessions
    .filter(session => isAbsolute(session.directory))
    .map(session => ({ sessionId: session.id, title: session.title || IMPORT_DEFAULT_TITLE, cwd: session.directory, updatedAt: session.time_updated }));
}

export async function readOpenCodeSession(sessionId: string) {
  const db = await openOpenCodeDatabase();
  if (!db) throw new Error("OpenCode history not found.");
  try {
    const session = db.prepare("SELECT id, directory, title, model, time_updated, parent_id FROM session WHERE id = ?").get(sessionId) as Record<string, any> | undefined;
    if (!session || session.parent_id || !isAbsolute(session.directory)) return null;
    const modelInfo = session.model ? JSON.parse(session.model) : undefined;
    let model = modelInfo?.providerID && modelInfo?.id ? `${modelInfo.providerID}/${modelInfo.id}` : undefined;
    const messages: Message[] = [];
    const size = db.prepare("SELECT (SELECT coalesce(sum(length(data)), 0) FROM message WHERE session_id = ?) + (SELECT coalesce(sum(length(data)), 0) FROM part WHERE session_id = ?) AS bytes").get(sessionId, sessionId) as { bytes: number };
    if (size.bytes > IMPORT_MAX_BYTES) throw new Error(IMPORT_TOO_LARGE);
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
        else if (part.type === "file" || part.type === "image") content.push({ id: uid("prt"), kind: "text", text: IMPORT_ATTACHMENT_NOTE, complete: true });
      }
      if (content.length) messages.push({ id: uid("msg"), role: data.role, ts: data.time?.created ?? row.time_created, parts: content, ...(data.role === "assistant" ? { provider: "opencode", model } : {}) });
    }
    return { sessionId, cwd: session.directory as string, title: session.title || IMPORT_DEFAULT_TITLE, model, updatedAt: session.time_updated as number, messages };
  } finally { db.close(); }
}
