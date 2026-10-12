import { botStore } from "./bot-store.ts";
import { groupStore } from "./group-store.ts";
import { PASS_REPLY, botHandle } from "../../shared/bots.ts";
import type { Bot, GroupAddress, MessageOrigin } from "../../shared/bots.ts";
import type { Thread } from "../../shared/protocol.ts";

function profile(bot: Bot): string {
  return [
    `You are ${bot.name}${bot.title ? `, ${bot.title}` : ""}, a Citropy bot with its own long-running conversation.`,
    bot.description ? `Standing instructions from the user:\n${bot.description}` : "",
    'Load tool_help with {"category":"bots"} to see the other bots, hand work to them with bots_message, post into your group chats with bots_group_post, and manage your routines, which are tasks you run on a schedule.',
  ].filter(Boolean).join("\n\n");
}

const ADDRESSED: Record<GroupAddress, string> = {
  you: "It is addressed to you.",
  everyone: "It is addressed to everyone in the group.",
  open: `It isn't addressed to anyone in particular. Answer only if it is clearly yours to handle, otherwise reply with exactly ${PASS_REPLY}.`,
};

function groupSender(origin: Extract<MessageOrigin, { kind: "group" }>): string {
  const group = groupStore.get(origin.groupId);
  const members = groupStore.members(group).map(bot => `${bot.name} (@${botHandle(bot.name)})`).join(", ");
  return [
    `This message is from ${origin.botId ? `${origin.name}, another bot,` : "the user"} in the group chat "${group.name}" (groupId ${group.id}). Members: ${members}.`,
    ADDRESSED[origin.addressed],
    `Your final reply is posted to the group as your message. To hand work to another member, @mention them in that reply. Reply with exactly ${PASS_REPLY} to acknowledgements or thanks.`,
  ].join(" ");
}

function sender(origin: MessageOrigin): string {
  if (origin.kind === "group") return groupSender(origin);
  if (origin.kind === "routine") return `Your routine "${origin.name}" is running on its schedule. Do the task below and report the result.`;
  const reply = origin.botId
    ? `When they asked for something back, send it with bots_message to botId ${origin.botId} once you're done. Don't reply to acknowledgements or thanks.`
    : "They can't receive replies, so do the task and report here.";
  return `This message is from ${origin.name}, not from the user. ${reply}`;
}

export function withBotContext(thread: Thread, prompt: string, origin?: MessageOrigin): string {
  if (!thread.botId) return prompt;
  const bot = botStore.get(thread.botId);
  const briefed = thread.externalId && (bot.briefedAt ?? 0) >= bot.profileUpdatedAt;
  const notes = [briefed ? "" : profile(bot), origin ? sender(origin) : ""].filter(Boolean);
  if (!briefed) botStore.markBriefed(bot.id);
  return notes.length ? `<citropy-bot>\n${notes.join("\n\n")}\n</citropy-bot>\n\n${prompt}` : prompt;
}
