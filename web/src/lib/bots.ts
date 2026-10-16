import { inBotsView, type Bot, type BotGroup, type BotGroupPatch, type BotProfile } from "../../../shared/bots.ts";
import type { BotThreadSettings } from "../../../shared/protocol.ts";
import type { ReactionKey } from "../../../shared/reactions.ts";
import { loadThread, newThreadSettings } from "./actions.ts";
import { awaitResponse } from "./requests.ts";
import { rosterItem } from "./roster.ts";
import { requestId, send } from "./socket.ts";
import { confirmAction, selectRosterEntry, showBotThread, showSectionThread, useApp } from "./store.ts";

// Bots, Chat, and Code each show their own conversation. Switching sections swaps to the one that section last showed.
useApp.subscribe((state, previous) => {
  const active = state.threads[state.activeThreadId ?? ""];
  if (active && !inBotsView(active) && state[active.chat ? "chatsThreadId" : "chatThreadId"] !== active.id)
    useApp.setState(active.chat ? { chatsThreadId: active.id } : { chatThreadId: active.id });
  if (state.activeView === "bots") {
    const wanted = rosterItem(state, state.activeRosterId)?.threadId ?? null;
    if (state.activeThreadId === wanted) return;
    showBotThread(wanted);
    if (wanted) loadThread(wanted);
    return;
  }
  const chats = state.activeView === "chats";
  // Also check when the conversations first arrive after a reload.
  const entered = state.activeView !== previous.activeView || (active ? !previous.threads[active.id] : state.threadOrder.length > 0 && !previous.threadOrder.length);
  const fits = chats ? Boolean(active?.chat)
    : active ? !active.chat : previous.activeView !== "bots" && previous.activeView !== "chats" && state.projects.some((project) => project.id === state.activeProjectId);
  if (!inBotsView(active) && (!entered || fits)) return;
  // What each section last showed is not kept across reloads, so fall back to its first open tab.
  const wanted = chats ? state.chatsThreadId : state.chatThreadId;
  const shown = wanted && state.threads[wanted] ? wanted
    : state.openThreadIds.find((id) => state.threads[id] && Boolean(state.threads[id].chat) === chats) ?? null;
  showSectionThread(shown);
  if (shown) loadThread(shown);
});

async function request<T>(event: (id: string) => Parameters<typeof send>[0]): Promise<T> {
  const id = requestId();
  const response = awaitResponse<T>(id);
  send(event(id));
  return response;
}

export function botThreadSettings(): BotThreadSettings | undefined {
  const settings = newThreadSettings();
  if (!settings) return undefined;
  const { workspace: _workspace, projectId: _projectId, ...thread } = settings;
  return thread;
}

function threadSettings(): BotThreadSettings {
  const thread = botThreadSettings();
  if (!thread) throw new Error("Sign in to a provider first.");
  return thread;
}

export function reactToMessage(threadId: string, messageId: string, key: ReactionKey, on: boolean): void {
  send({ t: "message.react", threadId, messageId, key, on });
}

export function openNewBotChat(): void {
  useApp.setState({ newBotChatOpen: true, newBotTemplate: null });
}

// Opens Create bot already filled in from a template.
export function openBotTemplate(id: string): void {
  useApp.setState({ newBotChatOpen: true, newBotTemplate: id });
}

export function closeNewBotChat(): void {
  useApp.setState({ newBotChatOpen: false });
}

export async function createBot(profile: Partial<BotProfile> = {}, template?: string, settings?: BotThreadSettings): Promise<Bot> {
  const thread = settings ?? threadSettings();
  const bot = await request<Bot>((id) => ({ t: "bot.create", requestId: id, thread, profile, template }));
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
    description: "This deletes the bot with its conversation, routines and memories.",
    label: "Delete",
    danger: true,
  });
  if (confirmed) send({ t: "bot.remove", id: bot.id });
}

export function removeMemory(botId: string, id: string): void {
  send({ t: "memory.remove", botId, id });
}
