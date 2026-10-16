import { botStore } from "../bots/bot-store.ts";
import { groupStore } from "../bots/group-store.ts";
import { createBot, settingsOf } from "../bots/create-bot.ts";
import { flag } from "../fields.ts";
import { react } from "../bots/reactions.ts";
import { uid } from "../ids.ts";
import { providerInfo } from "../providers/provider-registry.ts";
import { store } from "../store.ts";
import { createRequestedThread } from "../thread-request.ts";
import * as routines from "../routines/routine-store.ts";
import { removeThread } from "./threads.ts";
import { botTemplate } from "../../shared/bot-templates.ts";
import { lookOf } from "../../shared/bots.ts";
import type { BotThreadSettings } from "../../shared/protocol.ts";
import type { Routes } from "./types.ts";

async function createGroup(thread: BotThreadSettings, botIds: string[]) {
  groupStore.assertRoom(botIds);
  const id = uid("grp");
  const created = await createRequestedThread({ ...thread, projectId: store.botsProject!.id, workspace: { kind: "current" } }, providerInfo(), { title: "Group", groupId: id, workspacePath: store.botFolder(id) });
  try {
    return groupStore.create(id, created.id, botIds);
  } catch (error) {
    await removeThread(created.id);
    throw error;
  }
}

export const botRoutes: Routes = {
  "bot.create": async (event, send) => {
    const template = event.template ? botTemplate(event.template) : undefined;
    const bot = await createBot(event.thread, event.profile ?? {});
    if (template) routines.save(bot.threadId, template.routine);
    send({ t: "bot.upsert", bot, requestId: event.requestId });
  },
  "bot.update": (event, send) => {
    const bot = botStore.update(event.id, event.profile);
    if (event.requestId) send({ t: "bot.upsert", bot, requestId: event.requestId });
  },
  "bot.duplicate": async (event, send) => {
    const source = botStore.get(event.id);
    const thread = store.threads.get(source.threadId);
    if (!thread) throw new Error("This bot's conversation is missing.");
    const { name, title, description, notifications, connections } = source;
    const bot = await createBot(settingsOf(thread), { name: `${name} copy`, title, description, notifications, connections, ...lookOf(source) });
    routines.copy(source.threadId, bot.threadId);
    send({ t: "bot.upsert", bot, requestId: event.requestId });
  },
  "bot.remove": (event) => removeThread(botStore.get(event.id).threadId),
  "group.create": async (event, send) => {
    send({ t: "group.upsert", group: await createGroup(event.thread, event.botIds), requestId: event.requestId });
  },
  "group.update": (event, send) => {
    const group = groupStore.update(event.id, event.patch);
    if (event.requestId) send({ t: "group.upsert", group, requestId: event.requestId });
  },
  "group.remove": (event) => removeThread(groupStore.get(event.id).threadId),
  "memory.remove": (event) => botStore.removeMemory(event.botId, event.id),
  "message.react": (event) => react(event.threadId, event.messageId, event.key, flag(event.on, "Reaction")),
};
