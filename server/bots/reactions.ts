import { runtimeFor } from "../runtime.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import { inBotsView, previewText } from "../../shared/bots.ts";
import { checkReaction, reactionLabel } from "../../shared/reactions.ts";
import type { Message, Thread } from "../../shared/protocol.ts";

function excerpt(message: Message): string {
  const part = message.parts.find((entry) => entry.kind === "text" && entry.text.trim());
  return part?.kind === "text" ? previewText(part.text) : "";
}

function authorThread(thread: Thread, message: Message): string {
  const botId = thread.botId ?? (message.origin?.kind === "bot" ? message.origin.botId : undefined);
  if (!botId) throw new Error("This message has no bot to react to.");
  return botStore.get(botId).threadId;
}

export async function react(
  threadId: string,
  messageId: string,
  key: unknown,
  on: boolean,
): Promise<void> {
  const thread = store.threads.get(threadId);
  if (!inBotsView(thread)) throw new Error("Reactions are for bot conversations.");
  const message = store.readMessages(threadId).find((entry) => entry.id === messageId);
  if (message?.role !== "assistant") throw new Error("You can only react to a bot's message.");
  const reaction = checkReaction(key);
  const existing = message.reactions ?? [];
  const others = existing.filter((entry) => entry.key !== reaction);
  const added = on && others.length === existing.length;
  store.patchMessage(threadId, messageId, {
    reactions: on ? [...others, { key: reaction, at: Date.now() }] : others,
  });
  if (!added) return;
  const text = `Reacted with ${reactionLabel(reaction).toLowerCase()} to "${excerpt(message)}"`;
  await runtimeFor(authorThread(thread!, message)).send(text, [], {
    origin: { kind: "reaction", threadId, messageId, key: reaction },
  });
}
