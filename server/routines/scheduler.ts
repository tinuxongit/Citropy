import { bus } from "../bus.ts";
import { writeLog } from "../logs.ts";
import { runtimeFor, runtimeIfExists } from "../runtime.ts";
import { store } from "../store.ts";
import * as routines from "./routine-store.ts";
import type { Routine } from "../../shared/routines.ts";
import type { Thread } from "../../shared/protocol.ts";

const TICK_MS = 10_000;

interface ActiveRun {
  routineId: string;
  runId: string;
  started: boolean;
}

const active = new Map<string, ActiveRun>();

function busy(thread: Thread): boolean {
  return Boolean(
    active.has(thread.id) ||
    thread.running ||
    thread.queue?.length ||
    runtimeIfExists(thread.id)?.busy,
  );
}

function finishThreadRun(
  threadId: string,
  status: "ok" | "error" | "stopped",
  error?: string,
): void {
  const run = active.get(threadId);
  if (!run) return;
  active.delete(threadId);
  routines.finishRun(threadId, run.routineId, run.runId, status, error);
}

bus.subscribe((event) => {
  if (event.t === "thread.remove") active.delete(event.id);
  if (event.t !== "thread.upsert") return;
  const run = active.get(event.thread.id);
  if (!run) return;
  if (event.thread.running) run.started = true;
  else if (run.started) {
    const { status, error } = event.thread;
    finishThreadRun(
      event.thread.id,
      status === "error" ? "error" : status === "stopped" ? "stopped" : "ok",
      error,
    );
  }
});

export async function runRoutine(threadId: string, routineId: string, test = false): Promise<void> {
  const thread = store.threads.get(threadId);
  if (!thread) throw new Error("This conversation no longer exists.");
  const routine = routines.get(threadId, routineId);
  if (busy(thread)) throw new Error(`${thread.title} is busy. Try again when it finishes.`);
  const run = routines.startRun(threadId, routineId, test);
  active.set(threadId, { routineId, runId: run.id, started: false });
  try {
    await runtimeFor(threadId).send(routine.prompt, [], {
      origin: { kind: "routine", routineId, runId: run.id, name: routine.name },
    });
  } catch (error) {
    finishThreadRun(threadId, "error", (error as Error).message);
    throw error;
  }
}

function due(routine: Routine, now: number): boolean {
  return !routine.paused && routine.nextRunAt !== undefined && routine.nextRunAt <= now;
}

export function checkRoutines(now = Date.now()): void {
  for (const thread of store.threads.values()) {
    const routine = thread.routines?.find((entry) => due(entry, now));
    if (!routine || busy(thread)) continue;
    void runRoutine(thread.id, routine.id).catch((error: Error) =>
      writeLog(
        "error",
        "routines",
        `Routine "${routine.name}" in ${thread.title} failed to start: ${error.message}`,
      ),
    );
  }
}

export function startRoutines(): () => void {
  routines.stopInterruptedRuns();
  const timer = setInterval(checkRoutines, TICK_MS);
  timer.unref();
  checkRoutines();
  return () => clearInterval(timer);
}
