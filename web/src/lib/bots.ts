import type { Bot, BotProfile, RoutineDraft } from "../../../shared/bots.ts";
import { loadThread, newThreadSettings } from "./actions.ts";
import { awaitResponse } from "./requests.ts";
import { requestId, send } from "./socket.ts";
import { confirmAction, selectBot, showBotThread, useApp } from "./store.ts";

useApp.subscribe((state) => {
  if (state.activeView === "bots") {
    const wanted = state.bots[state.activeBotId ?? ""]?.threadId ?? null;
    if (state.activeThreadId === wanted) return;
    showBotThread(wanted);
    if (wanted) loadThread(wanted);
  } else if (state.threads[state.activeThreadId ?? ""]?.botId) {
    showBotThread(state.threads[state.chatThreadId ?? ""] ? state.chatThreadId : null);
  }
});

async function request<T>(event: (id: string) => Parameters<typeof send>[0]): Promise<T> {
  const id = requestId();
  const response = awaitResponse<T>(id);
  send(event(id));
  return response;
}

export async function createBot(profile: Partial<BotProfile> = {}): Promise<Bot | undefined> {
  const settings = newThreadSettings();
  if (!settings) return undefined;
  const { workspace: _workspace, ...thread } = settings;
  const bot = await request<Bot>((id) => ({ t: "bot.create", requestId: id, thread, profile }));
  selectBot(bot.id);
  return bot;
}

export function updateBot(id: string, profile: Partial<BotProfile>): Promise<Bot> {
  return request<Bot>((requestId) => ({ t: "bot.update", requestId, id, profile }));
}

export async function duplicateBot(id: string): Promise<void> {
  const bot = await request<Bot>((requestId) => ({ t: "bot.duplicate", requestId, id }));
  selectBot(bot.id);
}

export async function removeBot(bot: Bot): Promise<void> {
  const confirmed = await confirmAction({
    title: `Delete ${bot.name}?`,
    description: "This deletes the bot, its conversation, and its routines.",
    label: "Delete",
    danger: true,
  });
  if (confirmed) send({ t: "bot.remove", id: bot.id });
}

export function saveRoutine(botId: string, routine: RoutineDraft): Promise<Bot> {
  return request<Bot>((requestId) => ({ t: "routine.save", requestId, botId, routine }));
}

export function removeRoutine(botId: string, id: string): void {
  send({ t: "routine.remove", botId, id });
}

export function runRoutine(botId: string, id: string): void {
  send({ t: "routine.run", botId, id });
}
