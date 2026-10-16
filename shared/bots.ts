import type { ReactionKey } from "./reactions.ts";
import type { Message } from "./protocol.ts";

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
  connections: 50,
};

export function previewText(text: string): string {
  const line = text
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|`|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > BOT_LIMITS.previewLength
    ? `${line.slice(0, BOT_LIMITS.previewLength - 1).trimEnd()}…`
    : line;
}

export const EVERYONE_HANDLE = "everyone";
export const PASS_REPLY = "PASS";

export function isPass(text: string): boolean {
  return text.trim() === PASS_REPLY;
}

export function finalReply(messages: Message[]): string | undefined {
  const start = messages.findLastIndex((message) => message.role === "user");
  for (const message of messages.slice(start + 1).reverse()) {
    const part =
      message.role === "assistant"
        ? message.parts.findLast((entry) => entry.kind === "text" && entry.text.trim())
        : undefined;
    if (part?.kind === "text") return part.text.trim();
  }
}

export const BOT_COLORS = [
  "purple",
  "blue",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
] as const;
export type BotColor = (typeof BOT_COLORS)[number];

export const BOT_SHAPES = [
  "cloud",
  "drop",
  "pebble",
  "block",
  "circle",
  "capsule",
  "triangle",
  "hexagon",
  "heart",
  "star",
  "flower",
  "house",
] as const;
export type BotShape = (typeof BOT_SHAPES)[number];

export const BOT_FACES = [
  "neutral",
  "attentive",
  "surprised",
  "happy",
  "sad",
  "angry",
  "sleepy",
  "wink",
  "hearts",
  "x-eyes",
] as const;
export type BotFace = (typeof BOT_FACES)[number];

export const BOT_ACCESSORIES = [
  "none",
  "cat-ears",
  "bunny-ears",
  "dog-ears",
  "bear-ears",
  "top-hat",
  "party-hat",
  "crown",
  "beanie",
  "bow",
  "sprout",
  "antenna",
  "round-glasses",
  "square-glasses",
  "sunglasses",
  "heart-glasses",
  "reading-glasses",
  "monocle",
] as const;
export type BotAccessory = (typeof BOT_ACCESSORIES)[number];

export const BOT_LOOK_OPTIONS = {
  color: { label: "Color", values: BOT_COLORS },
  shape: { label: "Shape", values: BOT_SHAPES },
  face: { label: "Face", values: BOT_FACES },
  accessory: { label: "Accessory", values: BOT_ACCESSORIES },
} as const;

export type BotLook = Pick<Bot, keyof typeof BOT_LOOK_OPTIONS>;

export const NEW_BOT_LOOK = {
  face: "neutral",
  accessory: "none",
} as const satisfies Partial<BotLook>;

export function defaultLook(count: number): BotLook {
  return {
    color: BOT_COLORS[count % BOT_COLORS.length]!,
    shape: BOT_SHAPES[count % BOT_SHAPES.length]!,
    ...NEW_BOT_LOOK,
  };
}

export function lookOf(bot: BotLook): BotLook {
  return { color: bot.color, shape: bot.shape, face: bot.face, accessory: bot.accessory };
}

export function lookLabel(value: string): string {
  return value.replace(/-/g, " ");
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
  face: BotFace;
  accessory: BotAccessory;
  threadId: string;
  notifications: boolean;
  /** Connection ids this bot is signed in to. Empty means every connection. */
  connections: string[];
  pinned: boolean;
  hidden: boolean;
  profileUpdatedAt: number;
  briefedAt?: number;
  createdAt: number;
  preview?: string;
  unread?: boolean;
  memory: BotMemory[];
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

export type BotGroupPatch = Partial<
  Pick<BotGroup, "name" | "botIds" | "pinned" | "hidden" | "unread">
>;

export type BotProfile = Pick<
  Bot,
  | "name"
  | "title"
  | "description"
  | keyof BotLook
  | "notifications"
  | "connections"
  | "pinned"
  | "hidden"
  | "unread"
>;

export type MessageOrigin =
  | { kind: "bot"; threadId: string; botId?: string; name: string; depth: number }
  | { kind: "routine"; routineId: string; runId: string; name: string }
  | {
      kind: "group";
      groupId: string;
      deliveryId: string;
      group: string;
      name: string;
      botId?: string;
      depth: number;
      addressed: GroupAddress;
    }
  | { kind: "reaction"; threadId: string; messageId: string; key: ReactionKey };

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
