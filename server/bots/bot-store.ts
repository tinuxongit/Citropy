import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bus } from "../bus.ts";
import { uid } from "../ids.ts";
import { dataRoot } from "../paths.ts";
import { saveJson } from "../save-json.ts";
import { store } from "../store.ts";
import { addNotice, flag, text } from "../fields.ts";
import { BOT_LIMITS, BOT_LOOK_OPTIONS, NEW_BOT_LOOK, defaultLook, isPass, previewText } from "../../shared/bots.ts";
import type { Bot, BotMemory, BotProfile } from "../../shared/bots.ts";
import type { Message } from "../../shared/protocol.ts";

const NEW_BOT = { name: "New bot", title: "", description: "", notifications: true };

const botsFile = join(dataRoot, "bots.json");

function loadBots(): Bot[] {
  if (!existsSync(botsFile)) return [];
  return (JSON.parse(readFileSync(botsFile, "utf8")) as Bot[]).map(bot => ({ ...NEW_BOT_LOOK, ...bot }));
}

function answersGroup(messages: Message[], index: number): boolean {
  return messages.slice(0, index).findLast(message => message.role === "user")?.origin?.kind === "group";
}

function latestText(messages: Message[]): { text: string; unseenReply: boolean } | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.origin?.kind === "reaction") continue;
    const part = messages[index]!.parts.findLast(entry => entry.kind === "text" && entry.text.trim() && !isPass(entry.text));
    if (part?.kind === "text") return { text: previewText(part.text), unseenReply: messages[index]!.role === "assistant" && !answersGroup(messages, index) };
  }
}

function checkProfile(input: Partial<BotProfile>): Partial<BotProfile> {
  const profile: Partial<BotProfile> = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case "name": profile.name = text(value, "Name", BOT_LIMITS.nameLength, false); break;
      case "title": profile.title = text(value, "Title", BOT_LIMITS.titleLength); break;
      case "description": profile.description = text(value, "Description", BOT_LIMITS.descriptionLength); break;
      case "color":
      case "shape":
      case "face":
      case "accessory": {
        const option = BOT_LOOK_OPTIONS[key];
        if (!(option.values as readonly unknown[]).includes(value)) throw new Error(`Choose one of the listed ${option.label.toLowerCase()} options.`);
        Object.assign(profile, { [key]: value });
        break;
      }
      case "notifications": profile.notifications = flag(value, "Notifications"); break;
      case "pinned": profile.pinned = flag(value, "Pinned"); break;
      case "hidden": profile.hidden = flag(value, "Hidden"); break;
      case "unread": profile.unread = flag(value, "Unread"); break;
      default: throw new Error(`Bots have no ${key} setting.`);
    }
  }
  return profile;
}

class BotStore {
  bots = new Map(loadBots().map(bot => [bot.id, bot]));
  #stalePreviews = new Set<string>();

  constructor() {
    bus.subscribe(event => {
      if (event.t === "thread.remove") {
        const bot = this.byThread(event.id);
        if (bot) this.#forget(bot.id);
      }
      if (event.t === "message.add" && this.byThread(event.threadId)) this.#stalePreviews.add(event.threadId);
      if (event.t === "thread.upsert" && !event.thread.running && this.#stalePreviews.delete(event.thread.id)) this.#refreshPreview(event.thread.id);
    });
  }

  list(): Bot[] {
    return [...this.bots.values()];
  }

  get(id: string): Bot {
    const bot = this.bots.get(id);
    if (!bot) throw new Error("This bot no longer exists.");
    return bot;
  }

  byThread(threadId: string): Bot | undefined {
    return this.list().find(bot => bot.threadId === threadId);
  }

  muted(threadId: string): boolean {
    return this.byThread(threadId)?.notifications === false;
  }

  assertRoom(): void {
    if (this.bots.size >= BOT_LIMITS.bots) throw new Error(`You can keep up to ${BOT_LIMITS.bots} bots. Delete one to make room.`);
  }

  create(id: string, threadId: string, input: Partial<BotProfile> = {}): Bot {
    this.assertRoom();
    const bot: Bot = {
      id,
      ...NEW_BOT,
      ...defaultLook(this.bots.size),
      pinned: false,
      hidden: false,
      ...checkProfile(input),
      threadId,
      profileUpdatedAt: Date.now(),
      createdAt: Date.now(),
      memory: [],
    };
    this.bots.set(bot.id, bot);
    store.patchThread(threadId, { title: bot.name });
    this.#changed(bot);
    return bot;
  }

  update(id: string, input: Partial<BotProfile>): Bot {
    const bot = this.get(id);
    const profile = checkProfile(input);
    const renamed = profile.name !== undefined && profile.name !== bot.name;
    const briefChanged = (["name", "title", "description"] as const).some(key => profile[key] !== undefined && profile[key] !== bot[key]);
    Object.assign(bot, profile, briefChanged ? { profileUpdatedAt: Date.now() } : {});
    if (renamed) {
      store.patchThread(bot.threadId, { title: bot.name });
      addNotice(bot.threadId, `Renamed to ${bot.name}`);
    }
    this.#changed(bot);
    return bot;
  }

  markBriefed(id: string): void {
    const bot = this.get(id);
    bot.briefedAt = Date.now();
    this.#save();
  }

  memoryEntry(botId: string, id: string): BotMemory {
    const entry = this.get(botId).memory.find(memory => memory.id === id);
    if (!entry) throw new Error("This memory no longer exists.");
    return entry;
  }

  saveMemory(botId: string, draft: { id?: string; text: string }): BotMemory {
    const bot = this.get(botId);
    const fields = { text: text(draft.text, "Memory", BOT_LIMITS.memoryLength, false), savedAt: Date.now() };
    if (draft.id) {
      const entry = Object.assign(this.memoryEntry(botId, draft.id), fields);
      this.#changed(bot);
      return entry;
    }
    if (bot.memory.length >= BOT_LIMITS.memoryEntries) throw new Error(`A bot can keep up to ${BOT_LIMITS.memoryEntries} memories. Update or remove one first.`);
    const entry: BotMemory = { id: uid("mem"), ...fields };
    bot.memory.push(entry);
    this.#changed(bot);
    return entry;
  }

  removeMemory(botId: string, id: string): void {
    const bot = this.get(botId);
    const entry = this.memoryEntry(botId, id);
    bot.memory = bot.memory.filter(memory => memory !== entry);
    this.#changed(bot);
  }

  #refreshPreview(threadId: string): void {
    const bot = this.byThread(threadId);
    const latest = latestText(store.readMessages(threadId));
    if (!bot || latest === undefined || latest.text === bot.preview) return;
    bot.preview = latest.text;
    if (latest.unseenReply) bot.unread = true;
    this.#changed(bot);
  }

  #forget(id: string): void {
    if (!this.bots.delete(id)) return;
    this.#save();
    bus.emit({ t: "bot.remove", id });
  }

  #changed(bot: Bot): void {
    this.#save();
    bus.emit({ t: "bot.upsert", bot });
  }

  #save(): void {
    saveJson(botsFile, this.list());
  }
}

export const botStore = new BotStore();
