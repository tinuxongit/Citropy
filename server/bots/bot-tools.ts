import { required } from "../mcp-workspace.ts";
import { runtimeFor } from "../runtime.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import { createBot, settingsOf } from "./create-bot.ts";
import { addNotice } from "../fields.ts";
import { postFromBot } from "./group-chat.ts";
import { groupStore } from "./group-store.ts";
import { BOT_LIMITS, botHandle } from "../../shared/bots.ts";
import type { Bot } from "../../shared/bots.ts";
import type { Thread } from "../../shared/protocol.ts";

const LIST_DESCRIPTION_LENGTH = 500;
const CHANGES = new Set(["bots_create", "bots_message", "bots_group_post"]);

function summary(bot: Bot) {
  const thread = store.threads.get(bot.threadId);
  return {
    id: bot.id,
    name: bot.name,
    title: bot.title,
    description: bot.description.slice(0, LIST_DESCRIPTION_LENGTH),
    busy: Boolean(thread?.running),
    queued: thread?.queue?.length ?? 0,
    routines: thread?.routines?.length ?? 0,
  };
}

function ownBot(thread: Thread): Bot {
  if (!thread.botId) throw new Error("This conversation is not a bot.");
  return botStore.get(thread.botId);
}

function messageText(args: Record<string, unknown>): string {
  const text = required(args, "text");
  if (text.length > BOT_LIMITS.messageLength) throw new Error(`Keep bot messages under ${BOT_LIMITS.messageLength} characters.`);
  return text;
}

function currentDepth(thread: Thread): number {
  const origin = thread.messages.findLast(entry => entry.role === "user")?.origin;
  return origin?.kind === "bot" || origin?.kind === "group" ? origin.depth : 0;
}

function groups(bot: Bot) {
  return groupStore.list().filter(group => group.botIds.includes(bot.id)).map(group => ({
    id: group.id,
    name: group.name,
    members: groupStore.members(group).map(member => ({ botId: member.id, name: member.name, handle: `@${botHandle(member.name)}`, title: member.title })),
  }));
}

async function postToGroup(thread: Thread, args: Record<string, unknown>) {
  const bot = ownBot(thread);
  const group = groupStore.get(required(args, "groupId"));
  await postFromBot(group, bot, messageText(args), currentDepth(thread));
  return "Posted.";
}

async function message(thread: Thread, args: Record<string, unknown>) {
  const target = botStore.get(required(args, "botId"));
  if (target.threadId === thread.id) throw new Error("A bot cannot message itself.");
  const text = messageText(args);
  const depth = currentDepth(thread) + 1;
  if (depth > BOT_LIMITS.handoffDepth) throw new Error(`This chain of bot messages reached ${BOT_LIMITS.handoffDepth} handoffs. Report back to the user instead.`);
  const sender = thread.botId ? botStore.get(thread.botId) : undefined;
  await runtimeFor(target.threadId).send(text, [], {
    origin: { kind: "bot", threadId: thread.id, ...(sender ? { botId: sender.id } : {}), name: sender?.name ?? thread.title, depth },
  });
  return { sent: true, to: summary(target) };
}

async function create(thread: Thread, args: Record<string, unknown>) {
  const creator = thread.botId ? botStore.get(thread.botId).name : thread.title;
  const bot = await createBot(settingsOf(thread), {
    name: required(args, "name"),
    ...(args.title === undefined ? {} : { title: required(args, "title") }),
    ...(args.description === undefined ? {} : { description: required(args, "description") }),
  });
  addNotice(bot.threadId, `Created by ${creator}`);
  return summary(bot);
}

function memories(bot: Bot) {
  return bot.memory.map(entry => ({ id: entry.id, text: entry.text, savedAt: new Date(entry.savedAt).toISOString() }));
}

export async function callBotTool(thread: Thread, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (CHANGES.has(name) && thread.permissionMode === "plan") throw new Error("This action is unavailable in Plan only mode.");
  switch (name) {
    case "bots_list":
      return botStore.list().map(summary);
    case "bots_create":
      return create(thread, args);
    case "bots_message":
      return message(thread, args);
    case "bots_memory_list":
      return memories(ownBot(thread));
    case "bots_memory_save": {
      const bot = ownBot(thread);
      const entry = botStore.saveMemory(bot.id, { ...(args.id === undefined ? {} : { id: required(args, "id") }), text: required(args, "text") });
      return memories(bot).find(memory => memory.id === entry.id);
    }
    case "bots_memory_remove":
      botStore.removeMemory(ownBot(thread).id, required(args, "id"));
      return "Memory removed.";
    case "bots_group_list":
      return groups(ownBot(thread));
    case "bots_group_post":
      return postToGroup(thread, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
