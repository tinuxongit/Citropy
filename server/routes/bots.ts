import { botStore } from "../bots/bot-store.ts";
import { groupStore } from "../bots/group-store.ts";
import { runRoutine } from "../bots/routines.ts";
import { uid } from "../ids.ts";
import { providerInfo } from "../provider-registry.ts";
import { store } from "../store.ts";
import { createRequestedThread } from "../thread-request.ts";
import { removeThread } from "./threads.ts";
import type { BotProfile } from "../../shared/bots.ts";
import type { BotThreadSettings } from "../../shared/protocol.ts";
import type { Routes } from "./types.ts";

async function createGroup(thread: BotThreadSettings, botIds: string[]) {
  groupStore.assertRoom(botIds);
  const id = uid("grp");
  const created = await createRequestedThread({ ...thread, workspace: { kind: "current" } }, providerInfo(), { title: "Group", groupId: id });
  try {
    return groupStore.create(id, created.id, botIds);
  } catch (error) {
    await removeThread(created.id);
    throw error;
  }
}

async function createBot(thread: BotThreadSettings, profile: Partial<BotProfile>) {
  botStore.assertRoom();
  const id = uid("bot");
  const created = await createRequestedThread({ ...thread, workspace: { kind: "current" } }, providerInfo(), { title: profile.name ?? "New bot", botId: id });
  try {
    return botStore.create(id, created.id, profile);
  } catch (error) {
    await removeThread(created.id);
    throw error;
  }
}

export const botRoutes: Routes = {
  "bot.create": async (event, send) => {
    const bot = await createBot(event.thread, event.profile ?? {});
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
    const { name, title, description, color, shape, notifications } = source;
    const bot = await createBot(
      { projectId: thread.projectId, provider: thread.provider, providerInstanceId: thread.providerInstanceId, model: thread.model, effort: thread.effort, permissionMode: thread.permissionMode },
      { name: `${name} copy`, title, description, color, shape, notifications },
    );
    send({ t: "bot.upsert", bot: botStore.copyRoutines(source.id, bot.id), requestId: event.requestId });
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
  "routine.save": (event, send) => {
    botStore.saveRoutine(event.botId, event.routine);
    send({ t: "bot.upsert", bot: botStore.get(event.botId), requestId: event.requestId });
  },
  "routine.remove": (event) => {
    botStore.removeRoutine(event.botId, event.id);
  },
  "routine.run": (event) => runRoutine(event.botId, event.id, true),
};
