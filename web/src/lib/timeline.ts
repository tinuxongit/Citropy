import type { Part } from "../../../shared/protocol.ts";
import type { AppState } from "./app-state.ts";
import { buildRows, type Row } from "./group.ts";
import { normalizeTodos } from "../../../shared/todos.ts";

export interface TimelineRow {
  key: string;
  messageId?: string;
  row?: Row | FoldRow | LiveRow;
  first: boolean;
  last: boolean;
  replyIds?: string[];
  latestStep?: boolean;
}

export type FoldRow = { kind: "fold"; id: string; ids: string[]; messageIds: string[]; open: boolean; active: boolean; since: number };
export type LiveRow = { kind: "live"; messageIds: string[] };

export function partFingerprint(part: Part | undefined): string {
  if (!part) return "-";
  switch (part.kind) {
    case "text":
    case "reasoning":
      return `${part.kind === "text" ? "x" : "r"}${part.text.trim() ? 1 : 0}${part.complete === false ? 0 : 1}`;
    case "todo":
      return `d${normalizeTodos(part.items).length ? 1 : 0}`;
    case "question":
      return `q${part.status}`;
    case "tool":
      return `k${part.name}:${part.callId}:${part.images?.length ?? 0}:${part.imageFiles?.length ?? 0}`;
    case "images":
      return "i";
    case "changes":
      return `c${part.files.length}`;
    case "notice":
      return `n${part.level}`;
    default:
      return part.kind;
  }
}

function sameTimelineContent(previous: AppState, state: AppState, threadId: string): boolean {
  const order = state.order[threadId];
  if (previous.order[threadId] !== order) return false;
  const thread = state.threads[threadId];
  const previousThread = previous.threads[threadId];
  if (previousThread?.status !== thread?.status ||
    previousThread?.running !== thread?.running ||
    previousThread?.compacting !== thread?.compacting ||
    previousThread?.runStartedAt !== thread?.runStartedAt) return false;
  const version = state.timelineVersions?.[threadId];
  const sameParts = previous.parts === state.parts ||
    (version !== undefined && previous.timelineVersions?.[threadId] === version);
  const sameMessages = previous.messages === state.messages;
  const sameDisclosures = previous.disclosures === state.disclosures;
  if (sameMessages && sameParts && sameDisclosures) return true;
  for (const messageId of order ?? []) {
    const message = state.messages[messageId];
    if (!sameMessages && previous.messages[messageId] !== message) return false;
    for (const partId of message?.partIds ?? []) {
      if (!sameDisclosures && previous.disclosures[partId]?.activity !== state.disclosures[partId]?.activity) return false;
      if (!sameParts) {
        const part = state.parts.get(partId);
        const previousPart = previous.parts.get(partId);
        if (previousPart !== part && partFingerprint(previousPart) !== partFingerprint(part)) return false;
      }
    }
  }
  return true;
}

export function createTimelineSelector(threadId: string | null): (state: AppState) => TimelineRow[] {
  let rows: TimelineRow[] = [];
  let previous: AppState | undefined;
  return (state) => {
    if (!threadId) return rows;
    const unchanged = previous && sameTimelineContent(previous, state, threadId);
    previous = state;
    if (unchanged) return rows;
    const previousByKey = new Map(rows.map(item => [item.key, item]));
    const next = timelineRows(state, threadId).map(item => {
      const kept = previousByKey.get(item.key);
      return kept && sameTimelineRow(kept, item) ? kept : item;
    });
    if (next.length !== rows.length || next.some((item, index) => item !== rows[index])) rows = next;
    return rows;
  };
}

function isActionRow(row: Row, parts: AppState["parts"]): boolean {
  if (row.kind === "group") return true;
  if (row.kind !== "part") return false;
  const part = parts.get(row.id);
  return part?.kind === "tool" || part?.kind === "todo" || part?.kind === "question";
}

function finalAnswerRange(rows: Row[], parts: AppState["parts"]): { start: number; end: number } | undefined {
  const end = rows.findLastIndex(row => row.kind === "part" && parts.get(row.id)?.kind === "text");
  if (end === -1) return;

  let start = end;
  while (start > 0) {
    const previous = rows[start - 1]!;
    const part = previous.kind === "part" ? parts.get(previous.id) : undefined;
    if (part?.kind !== "text" && part?.kind !== "notice") break;
    start -= 1;
  }
  return { start, end };
}

export function timelineRows(state: AppState, threadId: string): TimelineRow[] {
  const order = state.order[threadId] ?? [];
  const thread = state.threads[threadId];
  const running = Boolean(thread?.running || thread?.compacting || ["thinking", "working", "queued", "awaiting"].includes(thread?.status ?? ""));
  const busy = Boolean(thread?.compacting || ["thinking", "working", "queued"].includes(thread?.status ?? ""));
  const startedAt = thread?.runStartedAt;
  const lastAssistantId = order.findLast(id => state.messages[id]?.role === "assistant");
  const turns: string[][] = [];
  for (const messageId of order) {
    const assistant = state.messages[messageId]?.role === "assistant";
    const previous = turns.at(-1);
    if (assistant && previous && state.messages[previous[0]!]?.role === "assistant") previous.push(messageId);
    else turns.push([messageId]);
  }
  const timeline = turns.flatMap<TimelineRow>((messageIds, turnIndex) => {
    const messageId = messageIds[0]!;
    const message = state.messages[messageId];
    if (!message) return [];
    if (message.role === "user") return [{ key: messageId, messageId, first: true, last: true }];
    const owners = new Map<string, string>();
    for (const id of messageIds) {
      for (const partId of state.messages[id]!.partIds) owners.set(partId, id);
    }
    const partIds = [...owners.keys()];
    const rows = buildRows(partIds.map((id) => state.parts.get(id)));
    const before = turns[turnIndex - 1]?.at(-1);
    const turnKey = before ?? threadId;
    const continuing = running && startedAt !== undefined && messageIds.some(id => state.messages[id]!.ts >= startedAt);
    const latest = order.at(-1) === messageIds.at(-1) || (continuing && messageIds.includes(lastAssistantId ?? ""));
    const active = latest && running && (startedAt === undefined || continuing);
    if (!rows.length && !active) return [];
    let visible: NonNullable<TimelineRow["row"]>[] = rows;
    let latestStep: Row | undefined;
    if (rows.some(row => isActionRow(row, state.parts) || row.kind === "part" && state.parts.get(row.id)?.kind === "reasoning")) {
      const finalAnswer = active ? undefined : finalAnswerRange(rows, state.parts);
      const work = rows.filter((row, index) => {
        if (finalAnswer && index >= finalAnswer.start && index <= finalAnswer.end) return false;
        const part = row.kind === "part" ? state.parts.get(row.id) : undefined;
        if (part?.kind === "question" && part.status === "pending") return false;
        if (part?.kind === "images" || part?.kind === "changes") return false;
        return part?.kind !== "notice" || part.level === "info";
      });
      const hidden = active ? work.slice(0, -1) : work;
      const id = partIds[0]!;
      const open = state.disclosures[id]?.activity ?? false;
      if (active && !open) latestStep = work.at(-1);
      if (hidden.length) {
        const since = state.messages[before ?? ""]?.ts ?? message.ts;
        const ids = work.flatMap(row => row.kind === "part" ? [row.id] : row.ids);
        visible = [{ kind: "fold", id, ids, messageIds, open, active, since }, ...rows.filter(row => open || !hidden.includes(row))];
      }
    }
    if (active) visible = [...visible, { kind: "live", messageIds }];
    return visible.map((row, index) => ({
      key: row.kind === "fold" ? `fold-${turnKey}` : row.kind === "live" ? `live-${turnKey}` : row.kind === "part" ? row.id : `${row.kind}-${row.ids[0]}`,
      messageId: row.kind === "fold" || row.kind === "live" ? messageId : owners.get(row.kind === "part" ? row.id : row.ids[0]!)!,
      row,
      first: index === 0,
      last: index === visible.length - 1,
      replyIds: index === visible.length - 1 ? messageIds : undefined,
      latestStep: row === latestStep || undefined,
    }));
  });
  if (busy && !timeline.some(row => row.row?.kind === "live")) {
    timeline.push({ key: `live-${order.at(-1) ?? threadId}`, first: true, last: true, row: { kind: "live", messageIds: [] } });
  }
  return timeline;
}

function sameIds(ids: string[] | undefined, other: string[] | undefined): boolean {
  return ids?.length === other?.length && (ids ?? []).every((id, i) => id === other![i]);
}

function sameTimelineRow(item: TimelineRow, other: TimelineRow): boolean {
  if (item.key !== other.key || item.messageId !== other.messageId ||
    item.first !== other.first || item.last !== other.last || item.latestStep !== other.latestStep || !sameIds(item.replyIds, other.replyIds) || item.row?.kind !== other.row?.kind) return false;
  const row = item.row;
  const next = other.row;
  if (!row || !next || row.kind === "part") return true;
  if (row.kind === "live" && next.kind === "live") return sameIds(row.messageIds, next.messageIds);
  if (row.kind === "fold" && next.kind === "fold" &&
    (row.id !== next.id || row.open !== next.open || row.active !== next.active || row.since !== next.since || !sameIds(row.messageIds, next.messageIds))) return false;
  return row.kind !== "live" && next.kind !== "live" && next.kind !== "part" && sameIds(row.ids, next.ids);
}
