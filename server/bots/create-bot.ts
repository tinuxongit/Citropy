import { uid } from "../ids.ts";
import { providerInfo } from "../provider-registry.ts";
import { removeThread } from "../routes/threads.ts";
import { store } from "../store.ts";
import { createRequestedThread } from "../thread-request.ts";
import { botStore } from "./bot-store.ts";
import type { BotProfile } from "../../shared/bots.ts";
import type { BotThreadSettings, Thread } from "../../shared/protocol.ts";

export function settingsOf(thread: Thread): BotThreadSettings {
  const { provider, providerInstanceId, model, effort, permissionMode } = thread;
  return { provider, providerInstanceId, model, effort, permissionMode };
}

export async function createBot(thread: BotThreadSettings, profile: Partial<BotProfile>) {
  botStore.assertRoom();
  const id = uid("bot");
  const created = await createRequestedThread({ ...thread, projectId: store.botsProject!.id, workspace: { kind: "current" } }, providerInfo(), { title: profile.name ?? "New bot", botId: id, workspacePath: store.botFolder(id) });
  try {
    return botStore.create(id, created.id, profile);
  } catch (error) {
    await removeThread(created.id);
    throw error;
  }
}
