import { store } from "../store.ts";
import { groupStore } from "./group-store.ts";
import { inBotsView, previewText } from "../../shared/bots.ts";
import { checkReaction, reactionLabel } from "../../shared/reactions.ts";
import type { Bot } from "../../shared/bots.ts";
import type { Message } from "../../shared/protocol.ts";

export function react(threadId: string, messageId: string, key: unknown, on: boolean): void {
  const thread = store.threads.get(threadId);
  if (!inBotsView(thread)) throw new Error("Reactions are for bot conversations.");
  const message = thread!.messages.find(entry => entry.id === messageId);
  if (message?.role !== "assistant") throw new Error("You can only react to a bot's message.");
  const reaction = checkReaction(key);
  const others = (message.reactions ?? []).filter(entry => entry.key !== reaction);
  store.patchMessage(threadId, messageId, { reactions: on ? [...others, { key: reaction, at: Date.now() }] : others });
}

function excerpt(message: Message): string {
  const part = message.parts.find(entry => entry.kind === "text" && entry.text.trim());
  return part?.kind === "text" ? previewText(part.text) : "";
}

function authoredBy(bot: Bot, threadId: string, message: Message): boolean {
  if (message.role !== "assistant") return false;
  return threadId === bot.threadId || (message.origin?.kind === "bot" && message.origin.botId === bot.id);
}

export function reactionNotes(bot: Bot): string[] {
  const since = bot.reactionsSeenAt ?? 0;
  const places = [
    { threadId: bot.threadId, where: "" },
    ...groupStore.list().filter(group => group.botIds.includes(bot.id)).map(group => ({ threadId: group.threadId, where: ` in the group chat "${group.name}"` })),
  ];
  return places.flatMap(({ threadId, where }) => store.readMessages(threadId)
    .filter(message => authoredBy(bot, threadId, message))
    .flatMap(message => (message.reactions ?? [])
      .filter(reaction => reaction.at > since)
      .map(reaction => `The user reacted with ${reactionLabel(reaction.key).toLowerCase()} to your message${where}: "${excerpt(message)}"`)));
}
