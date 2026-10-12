import { inBotsView, type Bot, type BotGroup, type BotGroupPatch, type BotProfile, type RoutineDraft } from "../../../shared/bots.ts";
import type { BotThreadSettings } from "../../../shared/protocol.ts";
import { loadThread, newThreadSettings } from "./actions.ts";
import { awaitResponse } from "./requests.ts";
import { rosterItem } from "./roster.ts";
import { requestId, send } from "./socket.ts";
import { confirmAction, selectRosterEntry, showBotThread, useApp } from "./store.ts";

useApp.subscribe((state) => {
  if (state.activeView === "bots") {
    const wanted = rosterItem(state, state.activeRosterId)?.threadId ?? null;
    if (state.activeThreadId === wanted) return;
    showBotThread(wanted);
    if (wanted) loadThread(wanted);
  } else if (inBotsView(state.threads[state.activeThreadId ?? ""])) {
    showBotThread(state.threads[state.chatThreadId ?? ""] ? state.chatThreadId : null);
  }
});

async function request<T>(event: (id: string) => Parameters<typeof send>[0]): Promise<T> {
  const id = requestId();
  const response = awaitResponse<T>(id);
  send(event(id));
  return response;
}

function threadSettings(): BotThreadSettings {
  const settings = newThreadSettings();
  if (!settings) throw new Error("Open a project with a signed-in provider first.");
  const { workspace: _workspace, ...thread } = settings;
  return thread;
}

export function openNewBotChat(): void {
  useApp.setState({ newBotChatOpen: true });
}

export function closeNewBotChat(): void {
  useApp.setState({ newBotChatOpen: false });
}

export async function createBot(profile: Partial<BotProfile> = {}): Promise<Bot> {
  const thread = threadSettings();
  const bot = await request<Bot>((id) => ({ t: "bot.create", requestId: id, thread, profile }));
  selectRosterEntry(bot.id);
  return bot;
}

export async function createGroup(botIds: string[]): Promise<BotGroup> {
  const thread = threadSettings();
  const group = await request<BotGroup>((id) => ({ t: "group.create", requestId: id, thread, botIds }));
  selectRosterEntry(group.id);
  return group;
}

export function updateGroup(id: string, patch: BotGroupPatch): Promise<BotGroup> {
  return request<BotGroup>((requestId) => ({ t: "group.update", requestId, id, patch }));
}

export async function removeGroup(group: BotGroup): Promise<void> {
  const confirmed = await confirmAction({
    title: `Delete ${group.name}?`,
    description: "This deletes the group chat. The bots in it stay.",
    label: "Delete",
    danger: true,
  });
  if (confirmed) send({ t: "group.remove", id: group.id });
}

export function updateBot(id: string, profile: Partial<BotProfile>): Promise<Bot> {
  return request<Bot>((requestId) => ({ t: "bot.update", requestId, id, profile }));
}

export async function duplicateBot(id: string): Promise<void> {
  const bot = await request<Bot>((requestId) => ({ t: "bot.duplicate", requestId, id }));
  selectRosterEntry(bot.id);
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
