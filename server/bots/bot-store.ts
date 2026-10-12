import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bus } from "../bus.ts";
import { uid } from "../ids.ts";
import { dataRoot } from "../paths.ts";
import { saveJson } from "../save-json.ts";
import { store } from "../store.ts";
import { BOT_COLORS, BOT_LIMITS, BOT_SHAPES, checkSchedule, nextRunAfter } from "../../shared/bots.ts";
import type { Bot, BotProfile, Routine, RoutineDraft, RoutineRun, RoutineRunStatus } from "../../shared/bots.ts";
import type { Message } from "../../shared/protocol.ts";

const NEW_BOT = { name: "New bot", title: "", description: "", notifications: true };

const botsFile = join(dataRoot, "bots.json");

function loadBots(): Bot[] {
  if (!existsSync(botsFile)) return [];
  const bots = JSON.parse(readFileSync(botsFile, "utf8")) as Bot[];
  for (const bot of bots)
    for (const routine of bot.routines)
      for (const run of routine.runs)
        if (run.status === "running") Object.assign(run, { status: "stopped", finishedAt: run.startedAt, error: "Citropy closed during this run." });
  return bots;
}

function latestText(messages: Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const part = messages[index]!.parts.findLast(entry => entry.kind === "text" && entry.text.trim());
    if (part?.kind === "text") return part.text.trim().slice(0, BOT_LIMITS.previewLength);
  }
}

function text(value: unknown, label: string, max: number, allowEmpty = true): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${label} cannot be empty.`);
  if (trimmed.length > max) throw new Error(`${label} can be at most ${max} characters.`);
  return trimmed;
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be on or off.`);
  return value;
}

function checkProfile(input: Partial<BotProfile>): Partial<BotProfile> {
  const profile: Partial<BotProfile> = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case "name": profile.name = text(value, "Name", BOT_LIMITS.nameLength, false); break;
      case "title": profile.title = text(value, "Title", BOT_LIMITS.titleLength); break;
      case "description": profile.description = text(value, "Description", BOT_LIMITS.descriptionLength); break;
      case "color":
        if (!BOT_COLORS.includes(value as never)) throw new Error("Choose one of the listed colors.");
        profile.color = value as BotProfile["color"];
        break;
      case "shape":
        if (!BOT_SHAPES.includes(value as never)) throw new Error("Choose one of the listed shapes.");
        profile.shape = value as BotProfile["shape"];
        break;
      case "notifications": profile.notifications = flag(value, "Notifications"); break;
      case "pinned": profile.pinned = flag(value, "Pinned"); break;
      case "hidden": profile.hidden = flag(value, "Hidden"); break;
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

  routine(botId: string, id: string): Routine {
    const routine = this.get(botId).routines.find(entry => entry.id === id);
    if (!routine) throw new Error("This routine no longer exists.");
    return routine;
  }

  assertRoom(): void {
    if (this.bots.size >= BOT_LIMITS.bots) throw new Error(`You can keep up to ${BOT_LIMITS.bots} bots. Delete one to make room.`);
  }

  create(id: string, threadId: string, input: Partial<BotProfile> = {}): Bot {
    this.assertRoom();
    const count = this.bots.size;
    const bot: Bot = {
      id,
      ...NEW_BOT,
      color: BOT_COLORS[count % BOT_COLORS.length]!,
      shape: BOT_SHAPES[count % BOT_SHAPES.length]!,
      pinned: false,
      hidden: false,
      ...checkProfile(input),
      threadId,
      profileUpdatedAt: Date.now(),
      createdAt: Date.now(),
      routines: [],
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
      this.#event(bot, `Renamed to ${bot.name}`);
    }
    this.#changed(bot);
    return bot;
  }

  markBriefed(id: string): void {
    const bot = this.get(id);
    bot.briefedAt = Date.now();
    this.#save();
  }

  saveRoutine(botId: string, draft: RoutineDraft): Routine {
    const bot = this.get(botId);
    const fields = {
      name: text(draft.name, "Routine name", BOT_LIMITS.routineNameLength, false),
      prompt: text(draft.prompt, "Instructions", BOT_LIMITS.promptLength, false),
      schedule: checkSchedule(draft.schedule),
      paused: flag(draft.paused, "Paused"),
    };
    const nextRunAt = fields.paused ? undefined : nextRunAfter(fields.schedule, Date.now());
    if (draft.id) {
      const routine = this.routine(botId, draft.id);
      Object.assign(routine, fields, { nextRunAt });
      this.#changed(bot);
      return routine;
    }
    if (bot.routines.length >= BOT_LIMITS.routinesPerBot) throw new Error(`A bot can have up to ${BOT_LIMITS.routinesPerBot} routines.`);
    const routine: Routine = { id: uid("rtn"), ...fields, nextRunAt, createdAt: Date.now(), runs: [] };
    bot.routines.push(routine);
    this.#event(bot, `Created routine ${routine.name}`);
    this.#changed(bot);
    return routine;
  }

  removeRoutine(botId: string, id: string): void {
    const bot = this.get(botId);
    const routine = this.routine(botId, id);
    bot.routines = bot.routines.filter(entry => entry !== routine);
    this.#event(bot, `Deleted routine ${routine.name}`);
    this.#changed(bot);
  }

  startRun(botId: string, routineId: string, test: boolean): RoutineRun {
    const bot = this.get(botId);
    const routine = this.routine(botId, routineId);
    const run: RoutineRun = { id: uid("run"), startedAt: Date.now(), status: "running", ...(test ? { test } : {}) };
    routine.runs = [run, ...routine.runs].slice(0, BOT_LIMITS.runsKept);
    if (!test && !routine.paused) routine.nextRunAt = nextRunAfter(routine.schedule, run.startedAt);
    this.#changed(bot);
    return run;
  }

  finishRun(botId: string, routineId: string, runId: string, status: Exclude<RoutineRunStatus, "running">, error?: string): void {
    const bot = this.bots.get(botId);
    const run = bot?.routines.find(entry => entry.id === routineId)?.runs.find(entry => entry.id === runId);
    if (!bot || run?.status !== "running") return;
    Object.assign(run, { status, finishedAt: Date.now() }, error ? { error } : {});
    this.#changed(bot);
  }

  #refreshPreview(threadId: string): void {
    const bot = this.byThread(threadId);
    const preview = latestText(store.readMessages(threadId));
    if (!bot || preview === undefined || preview === bot.preview) return;
    bot.preview = preview;
    this.#changed(bot);
  }

  #event(bot: Bot, line: string): void {
    store.addMessage(bot.threadId, { id: uid("msg"), role: "system", ts: Date.now(), parts: [{ id: uid("prt"), kind: "notice", level: "info", text: line }] });
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
