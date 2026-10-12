import { validateAttachments } from "../assets.ts";
import { bus } from "../bus.ts";
import { uid } from "../ids.ts";
import { runtimeFor } from "../runtime.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import { addNotice } from "./fields.ts";
import { groupStore } from "./group-store.ts";
import { BOT_LIMITS, EVERYONE_HANDLE, PASS_REPLY, botHandle, mentionedHandles } from "../../shared/bots.ts";
import type { Bot, BotGroup, GroupAddress } from "../../shared/bots.ts";
import type { Attachment, Message } from "../../shared/protocol.ts";

interface Delivery {
  groupId: string;
  botId: string;
  threadId: string;
  depth: number;
  delivered: boolean;
  started: boolean;
}

interface Sender {
  botId?: string;
  name: string;
}

const deliveries = new Map<string, Delivery>();

function recipients(group: BotGroup, text: string, authorId?: string): Array<[Bot, GroupAddress]> {
  const handles = mentionedHandles(text);
  const others = groupStore.members(group).filter(bot => bot.id !== authorId);
  if (handles.has(EVERYONE_HANDLE)) return others.map(bot => [bot, "everyone"]);
  const named = others.filter(bot => handles.has(botHandle(bot.name).toLowerCase()));
  if (named.length) return named.map(bot => [bot, "you"]);
  return authorId ? [] : others.map(bot => [bot, "open"]);
}

function withFiles(text: string, attachments: Attachment[]): string {
  if (!attachments.length) return text;
  return `${text}\n\nAttached files:\n${attachments.map(file => `- ${file.label}: ${file.path}`).join("\n")}`;
}

async function deliver(group: BotGroup, text: string, attachments: Attachment[], sender: Sender, depth: number): Promise<void> {
  const targets = recipients(group, text, sender.botId);
  if (!targets.length) return;
  if (depth > BOT_LIMITS.handoffDepth) {
    addNotice(group.threadId, `Stopped after ${BOT_LIMITS.handoffDepth} handoffs between bots.`);
    return;
  }
  await Promise.all(targets.map(async ([bot, addressed]) => {
    const deliveryId = uid("dlv");
    deliveries.set(deliveryId, { groupId: group.id, botId: bot.id, threadId: bot.threadId, depth, delivered: false, started: false });
    groupStore.setWorking(group.id, bot.id, true);
    try {
      await runtimeFor(bot.threadId).send(withFiles(text, attachments), [], {
        origin: { kind: "group", groupId: group.id, deliveryId, group: group.name, name: sender.name, ...(sender.botId ? { botId: sender.botId } : {}), depth, addressed },
      });
    } catch (error) {
      deliveries.delete(deliveryId);
      groupStore.setWorking(group.id, bot.id, false);
      addNotice(group.threadId, `${bot.name} didn't get the message: ${(error as Error).message}`);
    }
  }));
}

export async function postFromUser(threadId: string, text: string, files: Attachment[] = []): Promise<void> {
  const group = groupStore.byThread(threadId);
  if (!group) throw new Error("This group no longer exists.");
  if (typeof text !== "string" || text.length > BOT_LIMITS.messageLength) throw new Error(`Keep messages under ${BOT_LIMITS.messageLength} characters.`);
  const attachments = await validateAttachments(threadId, files);
  if (!text.trim() && !attachments.length) throw new Error("Write a message first.");
  if (!group.botIds.length) throw new Error("Add a bot to this group first.");
  store.addMessage(threadId, { id: uid("msg"), role: "user", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text }], ...(attachments.length ? { attachments } : {}) });
  store.raiseThread(threadId);
  await deliver(group, text, attachments, { name: "You" }, 1);
}

export async function postFromBot(group: BotGroup, bot: Bot, text: string, depth: number): Promise<void> {
  if (!group.botIds.includes(bot.id)) throw new Error(`${bot.name} is not in ${group.name}.`);
  store.addMessage(group.threadId, {
    id: uid("msg"),
    role: "assistant",
    ts: Date.now(),
    parts: [{ id: uid("prt"), kind: "text", text }],
    origin: { kind: "bot", threadId: bot.threadId, botId: bot.id, name: bot.name, depth },
  });
  store.raiseThread(group.threadId);
  await deliver(group, text, [], { botId: bot.id, name: bot.name }, depth + 1);
}

function finalReply(messages: Message[]): string | undefined {
  const start = messages.findLastIndex(message => message.role === "user");
  for (const message of messages.slice(start + 1).reverse()) {
    const part = message.role === "assistant" ? message.parts.findLast(entry => entry.kind === "text" && entry.text.trim()) : undefined;
    if (part?.kind === "text") return part.text.trim();
  }
}

function finish(id: string, delivery: Delivery, status: string, error?: string): void {
  deliveries.delete(id);
  groupStore.setWorking(delivery.groupId, delivery.botId, false);
  const group = groupStore.groups.get(delivery.groupId);
  const bot = botStore.bots.get(delivery.botId);
  if (!group || !bot) return;
  if (status === "error") return addNotice(group.threadId, `${bot.name} ran into an error${error ? `: ${error}` : "."}`);
  if (status === "stopped") return addNotice(group.threadId, `${bot.name} stopped before replying.`);
  const reply = finalReply(store.readMessages(delivery.threadId));
  if (!reply || reply === PASS_REPLY) return;
  void postFromBot(group, bot, reply, delivery.depth).catch((failure: Error) => addNotice(group.threadId, failure.message));
}

bus.subscribe(event => {
  if (event.t === "message.add" && event.message.origin?.kind === "group") {
    const delivery = deliveries.get(event.message.origin.deliveryId);
    if (delivery) delivery.delivered = true;
  }
  if (event.t === "thread.remove") {
    for (const [id, delivery] of deliveries) if (delivery.threadId === event.id) finish(id, delivery, "stopped");
  }
  if (event.t !== "thread.upsert") return;
  for (const [id, delivery] of deliveries) {
    if (delivery.threadId !== event.thread.id || !delivery.delivered) continue;
    if (event.thread.running) delivery.started = true;
    else if (delivery.started) finish(id, delivery, event.thread.status, event.thread.error);
  }
});
