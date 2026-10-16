import { addNotice, flag, text } from "../fields.ts";
import { uid } from "../ids.ts";
import { store } from "../store.ts";
import { ROUTINE_LIMITS, checkSchedule, nextRunAfter } from "../../shared/routines.ts";
import type { Routine, RoutineDraft, RoutineRun, RoutineRunStatus } from "../../shared/routines.ts";
import type { Thread } from "../../shared/protocol.ts";

function thread(threadId: string): Thread {
  const found = store.threads.get(threadId);
  if (!found) throw new Error("This conversation no longer exists.");
  return found;
}

function replace(threadId: string, routines: Routine[]): void {
  store.patchThread(threadId, { routines });
}

function update(threadId: string, id: string, change: (routine: Routine) => Routine): Routine {
  const routine = change(get(threadId, id));
  replace(
    threadId,
    list(threadId).map((entry) => (entry.id === id ? routine : entry)),
  );
  return routine;
}

function sameSchedule(routine: Routine | undefined, draft: Routine["schedule"]): boolean {
  return JSON.stringify(routine?.schedule) === JSON.stringify(draft);
}

export function list(threadId: string): Routine[] {
  return thread(threadId).routines ?? [];
}

export function get(threadId: string, id: string): Routine {
  const routine = list(threadId).find((entry) => entry.id === id);
  if (!routine) throw new Error("This routine no longer exists.");
  return routine;
}

export function save(threadId: string, draft: RoutineDraft): Routine {
  const existing = draft.id ? get(threadId, draft.id) : undefined;
  const fields = {
    name: text(draft.name, "Routine name", ROUTINE_LIMITS.nameLength, false),
    prompt: text(draft.prompt, "Instructions", ROUTINE_LIMITS.promptLength, false),
    schedule: checkSchedule(draft.schedule),
    paused: flag(draft.paused, "Paused"),
  };
  const nextRunAt = fields.paused ? undefined : nextRunAfter(fields.schedule, Date.now());
  if (
    fields.schedule.kind === "once" &&
    nextRunAt === undefined &&
    !fields.paused &&
    !sameSchedule(existing, fields.schedule)
  )
    throw new Error("Choose a time in the future.");
  if (existing)
    return update(threadId, existing.id, (routine) => ({ ...routine, ...fields, nextRunAt }));
  const routines = list(threadId);
  if (routines.length >= ROUTINE_LIMITS.perThread)
    throw new Error(`A conversation can have up to ${ROUTINE_LIMITS.perThread} routines.`);
  const routine: Routine = {
    id: uid("rtn"),
    ...fields,
    nextRunAt,
    createdAt: Date.now(),
    runs: [],
  };
  replace(threadId, [...routines, routine]);
  addNotice(threadId, `Created routine ${routine.name}`);
  return routine;
}

export function copy(fromThreadId: string, toThreadId: string): void {
  replace(
    toThreadId,
    list(fromThreadId).map((routine) => ({
      ...structuredClone(routine),
      id: uid("rtn"),
      createdAt: Date.now(),
      runs: [],
      nextRunAt: routine.paused ? undefined : nextRunAfter(routine.schedule, Date.now()),
    })),
  );
}

export function remove(threadId: string, id: string): void {
  const routine = get(threadId, id);
  replace(
    threadId,
    list(threadId).filter((entry) => entry !== routine),
  );
  addNotice(threadId, `Deleted routine ${routine.name}`);
}

export function startRun(threadId: string, routineId: string, test: boolean): RoutineRun {
  const run: RoutineRun = {
    id: uid("run"),
    startedAt: Date.now(),
    status: "running",
    ...(test ? { test } : {}),
  };
  update(threadId, routineId, (routine) => ({
    ...routine,
    runs: [run, ...routine.runs].slice(0, ROUTINE_LIMITS.runsKept),
    ...(!test && !routine.paused
      ? { nextRunAt: nextRunAfter(routine.schedule, run.startedAt) }
      : {}),
  }));
  return run;
}

export function finishRun(
  threadId: string,
  routineId: string,
  runId: string,
  status: Exclude<RoutineRunStatus, "running">,
  error?: string,
): void {
  const routine = store.threads.get(threadId)?.routines?.find((entry) => entry.id === routineId);
  if (routine?.runs.find((run) => run.id === runId)?.status !== "running") return;
  update(threadId, routineId, (current) => ({
    ...current,
    runs: current.runs.map((run) =>
      run.id === runId
        ? { ...run, status, finishedAt: Date.now(), ...(error ? { error } : {}) }
        : run,
    ),
  }));
}

export function stopInterruptedRuns(): void {
  for (const entry of store.threads.values()) {
    if (!entry.routines?.some((routine) => routine.runs.some((run) => run.status === "running")))
      continue;
    replace(
      entry.id,
      entry.routines.map((routine) => ({
        ...routine,
        runs: routine.runs.map((run) =>
          run.status === "running"
            ? {
                ...run,
                status: "stopped",
                finishedAt: run.startedAt,
                error: "Citropy closed during this run.",
              }
            : run,
        ),
      })),
    );
  }
}
