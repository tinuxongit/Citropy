import { bus } from "../bus.ts";
import { writeLog } from "../logs.ts";
import { runtimeFor, runtimeIfExists } from "../runtime.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import type { Bot, Routine } from "../../shared/bots.ts";

const TICK_MS = 30_000;

interface ActiveRun {
  botId: string;
  routineId: string;
  runId: string;
  started: boolean;
}

const active = new Map<string, ActiveRun>();

function busy(bot: Bot): boolean {
  const thread = store.threads.get(bot.threadId);
  return Boolean(active.has(bot.threadId) || thread?.running || thread?.queue?.length || runtimeIfExists(bot.threadId)?.busy);
}

function finishThreadRun(threadId: string, status: "ok" | "error" | "stopped", error?: string): void {
  const run = active.get(threadId);
  if (!run) return;
  active.delete(threadId);
  botStore.finishRun(run.botId, run.routineId, run.runId, status, error);
}

bus.subscribe(event => {
  if (event.t === "thread.remove") active.delete(event.id);
  if (event.t !== "thread.upsert") return;
  const run = active.get(event.thread.id);
  if (!run) return;
  if (event.thread.running) run.started = true;
  else if (run.started) {
    const { status, error } = event.thread;
    finishThreadRun(event.thread.id, status === "error" ? "error" : status === "stopped" ? "stopped" : "ok", error);
  }
});

export async function runRoutine(botId: string, routineId: string, test = false): Promise<void> {
  const bot = botStore.get(botId);
  const routine = botStore.routine(botId, routineId);
  if (busy(bot)) throw new Error(`${bot.name} is busy. Try again when it finishes.`);
  const run = botStore.startRun(botId, routineId, test);
  active.set(bot.threadId, { botId, routineId, runId: run.id, started: false });
  try {
    await runtimeFor(bot.threadId).send(routine.prompt, [], { origin: { kind: "routine", routineId, runId: run.id, name: routine.name } });
  } catch (error) {
    finishThreadRun(bot.threadId, "error", (error as Error).message);
    throw error;
  }
}

function due(routine: Routine, now: number): boolean {
  return !routine.paused && routine.nextRunAt !== undefined && routine.nextRunAt <= now;
}

export function checkRoutines(now = Date.now()): void {
  for (const bot of botStore.list()) {
    if (busy(bot)) continue;
    const routine = bot.routines.find(entry => due(entry, now));
    if (!routine) continue;
    void runRoutine(bot.id, routine.id).catch((error: Error) =>
      writeLog("error", "routines", `Routine "${routine.name}" for ${bot.name} failed to start: ${error.message}`));
  }
}

export function startRoutines(): () => void {
  const timer = setInterval(checkRoutines, TICK_MS);
  timer.unref();
  checkRoutines();
  return () => clearInterval(timer);
}
