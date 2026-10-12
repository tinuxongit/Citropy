import type { Bot } from "../../../../shared/bots.ts";
import type { ThreadMeta } from "../../../../shared/protocol.ts";
import type { BotMood } from "./BotAvatar.tsx";

export function lastActive(bot: Bot, thread: ThreadMeta | undefined): number {
  return thread?.updatedAt ?? bot.createdAt;
}

export function orderedBots(bots: Record<string, Bot>, threads: Record<string, ThreadMeta>): { shown: Bot[]; hidden: Bot[] } {
  const sorted = Object.values(bots).sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || lastActive(b, threads[b.threadId]) - lastActive(a, threads[a.threadId]));
  return { shown: sorted.filter((bot) => !bot.hidden), hidden: sorted.filter((bot) => bot.hidden) };
}

export function botMood(thread: ThreadMeta | undefined): BotMood {
  if (thread?.status === "awaiting") return "awaiting";
  return thread?.running ? "working" : "idle";
}
