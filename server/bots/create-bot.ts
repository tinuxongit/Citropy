import { uid } from "../ids.ts";
import { providerInfo } from "../provider-registry.ts";
import { removeThread } from "../routes/threads.ts";
import { createRequestedThread } from "../thread-request.ts";
import { botStore } from "./bot-store.ts";
import type { BotProfile } from "../../shared/bots.ts";
import type { BotThreadSettings, Thread } from "../../shared/protocol.ts";

export function settingsOf(thread: Thread): BotThreadSettings {
  const { projectId, provider, providerInstanceId, model, effort, permissionMode } = thread;
  return { projectId, provider, providerInstanceId, model, effort, permissionMode };
}

export async function createBot(thread: BotThreadSettings, profile: Partial<BotProfile>) {
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
