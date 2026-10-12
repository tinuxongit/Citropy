import { required } from "../mcp-workspace.ts";
import { runtimeFor } from "../runtime.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import { BOT_LIMITS, describeSchedule } from "../../shared/bots.ts";
import type { Bot, RoutineSchedule } from "../../shared/bots.ts";
import type { Thread } from "../../shared/protocol.ts";

const LIST_DESCRIPTION_LENGTH = 500;
const LISTED_RUNS = 5;
const CHANGES = new Set(["bots_message", "bots_routine_save", "bots_routine_remove"]);

function summary(bot: Bot) {
  const thread = store.threads.get(bot.threadId);
  return {
    id: bot.id,
    name: bot.name,
    title: bot.title,
    description: bot.description.slice(0, LIST_DESCRIPTION_LENGTH),
    busy: Boolean(thread?.running),
    queued: thread?.queue?.length ?? 0,
    routines: bot.routines.length,
  };
}

function targetBot(thread: Thread, args: Record<string, unknown>): Bot {
  if (args.botId !== undefined) return botStore.get(required(args, "botId"));
  if (!thread.botId) throw new Error("Pass a botId. This conversation is not a bot.");
  return botStore.get(thread.botId);
}

async function message(thread: Thread, args: Record<string, unknown>) {
  const target = botStore.get(required(args, "botId"));
  if (target.threadId === thread.id) throw new Error("A bot cannot message itself.");
  const text = required(args, "text");
  if (text.length > BOT_LIMITS.messageLength) throw new Error(`Keep bot messages under ${BOT_LIMITS.messageLength} characters.`);
  const current = thread.messages.findLast(entry => entry.role === "user")?.origin;
  const depth = current?.kind === "bot" ? current.depth + 1 : 1;
  if (depth > BOT_LIMITS.handoffDepth) throw new Error(`This chain of bot messages reached ${BOT_LIMITS.handoffDepth} handoffs. Report back to the user instead.`);
  const sender = thread.botId ? botStore.get(thread.botId) : undefined;
  await runtimeFor(target.threadId).send(text, [], {
    origin: { kind: "bot", threadId: thread.id, ...(sender ? { botId: sender.id } : {}), name: sender?.name ?? thread.title, depth },
  });
  return { sent: true, to: summary(target) };
}

function routines(bot: Bot) {
  return bot.routines.map(routine => ({
    id: routine.id,
    name: routine.name,
    prompt: routine.prompt,
    schedule: routine.schedule,
    when: describeSchedule(routine.schedule),
    paused: routine.paused,
    ...(routine.nextRunAt ? { nextRunAt: new Date(routine.nextRunAt).toISOString() } : {}),
    recentRuns: routine.runs.slice(0, LISTED_RUNS).map(run => ({ status: run.status, startedAt: new Date(run.startedAt).toISOString(), ...(run.error ? { error: run.error } : {}) })),
  }));
}

export async function callBotTool(thread: Thread, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (CHANGES.has(name) && thread.permissionMode === "plan") throw new Error("This action is unavailable in Plan only mode.");
  switch (name) {
    case "bots_list":
      return botStore.list().map(summary);
    case "bots_message":
      return message(thread, args);
    case "bots_routine_list":
      return routines(targetBot(thread, args));
    case "bots_routine_save": {
      const bot = targetBot(thread, args);
      if (args.paused !== undefined && typeof args.paused !== "boolean") throw new Error("paused must be true or false");
      const routine = botStore.saveRoutine(bot.id, {
        ...(args.id === undefined ? {} : { id: required(args, "id") }),
        name: required(args, "name"),
        prompt: required(args, "prompt"),
        schedule: args.schedule as RoutineSchedule,
        paused: args.paused === true,
      });
      return routines(bot).find(entry => entry.id === routine.id);
    }
    case "bots_routine_remove": {
      const bot = targetBot(thread, args);
      botStore.removeRoutine(bot.id, required(args, "id"));
      return "Routine deleted.";
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
