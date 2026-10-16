import type { Bot, BotGroup } from "../../../shared/bots.ts";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import type { AppState } from "./app-state.ts";

export type BotMood = "idle" | "working" | "awaiting";

export type RosterEntry = { kind: "bot"; item: Bot } | { kind: "group"; item: BotGroup };

export function lastActive(item: Bot | BotGroup, thread: ThreadMeta | undefined): number {
  return thread?.updatedAt ?? item.createdAt;
}

export function orderedRoster(state: Pick<AppState, "bots" | "botGroups" | "threads">): {
  shown: RosterEntry[];
  hidden: RosterEntry[];
} {
  const entries: RosterEntry[] = [
    ...Object.values(state.bots).map((item) => ({ kind: "bot" as const, item })),
    ...Object.values(state.botGroups).map((item) => ({ kind: "group" as const, item })),
  ];
  const sorted = entries.sort(
    (a, b) =>
      Number(b.item.pinned) - Number(a.item.pinned) ||
      lastActive(b.item, state.threads[b.item.threadId]) -
        lastActive(a.item, state.threads[a.item.threadId]),
  );
  return {
    shown: sorted.filter((entry) => !entry.item.hidden),
    hidden: sorted.filter((entry) => entry.item.hidden),
  };
}

export function searchMatcher(query: string): (text: string) => boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return (text) => words.every((word) => text.toLowerCase().includes(word));
}

export function entryText({ item }: RosterEntry): string {
  return "title" in item
    ? `${item.name} ${item.title} ${item.description} ${item.preview ?? ""}`
    : `${item.name} ${item.preview ?? ""}`;
}

export function rosterItem(
  state: Pick<AppState, "bots" | "botGroups">,
  id: string | null,
): Bot | BotGroup | undefined {
  return state.bots[id ?? ""] ?? state.botGroups[id ?? ""];
}

export function neighborOf(
  state: Pick<AppState, "bots" | "botGroups" | "threads">,
  id: string,
): string | null {
  const { shown } = orderedRoster(state);
  const index = shown.findIndex((entry) => entry.item.id === id);
  if (index === -1) return null;
  return (shown[index + 1] ?? shown[index - 1])?.item.id ?? null;
}

export function workingLine(names: string[]): string {
  return `${names.join(", ")} ${names.length === 1 ? "is" : "are"} working…`;
}

export function botMood(thread: ThreadMeta | undefined): BotMood {
  if (thread?.status === "awaiting") return "awaiting";
  return thread?.running ? "working" : "idle";
}
