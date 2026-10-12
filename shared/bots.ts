export const BOT_LIMITS = {
  bots: 50,
  nameLength: 60,
  titleLength: 60,
  descriptionLength: 4000,
  messageLength: 20_000,
  handoffDepth: 8,
  previewLength: 160,
  groups: 50,
  groupNameLength: 80,
  groupMembersMin: 2,
  groupMembersMax: 6,
  memoryEntries: 40,
  memoryLength: 600,
};

export function previewText(text: string): string {
  const line = text
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|`|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > BOT_LIMITS.previewLength ? `${line.slice(0, BOT_LIMITS.previewLength - 1).trimEnd()}…` : line;
}

export const EVERYONE_HANDLE = "everyone";
export const PASS_REPLY = "PASS";

export const BOT_COLORS = ["purple", "blue", "teal", "green", "yellow", "orange", "red", "pink"] as const;
export type BotColor = typeof BOT_COLORS[number];

export const BOT_SHAPES = ["cloud", "drop", "pebble", "block"] as const;
export type BotShape = typeof BOT_SHAPES[number];

export function defaultLook(count: number): Pick<Bot, "color" | "shape"> {
  return { color: BOT_COLORS[count % BOT_COLORS.length]!, shape: BOT_SHAPES[count % BOT_SHAPES.length]! };
}

export interface BotMemory {
  id: string;
  text: string;
  savedAt: number;
}

export interface Bot {
  id: string;
  name: string;
  title: string;
  description: string;
  color: BotColor;
  shape: BotShape;
  threadId: string;
  notifications: boolean;
  pinned: boolean;
  hidden: boolean;
  profileUpdatedAt: number;
  briefedAt?: number;
  createdAt: number;
  preview?: string;
  unread?: boolean;
  memory: BotMemory[];
  reactionsSeenAt?: number;
}

export interface BotGroup {
  id: string;
  name: string;
  botIds: string[];
  threadId: string;
  pinned: boolean;
  hidden: boolean;
  createdAt: number;
  preview?: string;
  unread?: boolean;
  working: string[];
}

export type BotGroupPatch = Partial<Pick<BotGroup, "name" | "botIds" | "pinned" | "hidden" | "unread">>;

export type BotProfile = Pick<Bot, "name" | "title" | "description" | "color" | "shape" | "notifications" | "pinned" | "hidden" | "unread">;

export type MessageOrigin =
  | { kind: "bot"; threadId: string; botId?: string; name: string; depth: number }
  | { kind: "routine"; routineId: string; runId: string; name: string }
  | { kind: "group"; groupId: string; deliveryId: string; group: string; name: string; botId?: string; depth: number; addressed: GroupAddress };

export type GroupAddress = "you" | "everyone" | "open";

export function inBotsView(thread: { botId?: string; groupId?: string } | undefined): boolean {
  return Boolean(thread?.botId || thread?.groupId);
}

export function botHandle(name: string): string {
  return name.replace(/[^\w.-]/g, "");
}

export function mentionedHandles(text: string): Set<string> {
  return new Set([...text.matchAll(/(?:^|\s)@([\w.-]+)/g)].map((match) => match[1]!.toLowerCase()));
}
