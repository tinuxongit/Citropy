import type { ThreadMeta } from "../shared/protocol.ts";

type MessageTexts = (threadId: string) => Iterable<{ id: string; text: string }>;

export function searchConversations(threads: Iterable<ThreadMeta>, messageTexts: MessageTexts, query: string, projectId?: string) {
  const needle = query.trim().toLocaleLowerCase().slice(0, 300);
  if (!needle) return [];
  const results: Array<{ threadId: string; messageId?: string; snippet: string }> = [];
  for (const thread of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (projectId && thread.projectId !== projectId) continue;
    let match: { threadId: string; messageId?: string; snippet: string } | undefined;
    for (const message of messageTexts(thread.id)) {
      const text = message.text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`#*]/g, "").replace(/\s+/g, " ");
      const index = text.toLocaleLowerCase().indexOf(needle);
      if (index < 0) continue;
      const start = Math.max(0, index - 55);
      match = { threadId: thread.id, messageId: message.id, snippet: `${start ? "…" : ""}${text.slice(start, index + needle.length + 100)}${text.length > index + needle.length + 100 ? "…" : ""}` };
      break;
    }
    if (match) results.push(match);
    else if (thread.title.toLocaleLowerCase().includes(needle)) results.push({ threadId: thread.id, snippet: thread.title });
    if (results.length === 100) break;
  }
  return results;
}
