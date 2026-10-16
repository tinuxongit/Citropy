import { botStore } from "../bots/bot-store.ts";
import { required } from "../mcp/mcp-workspace.ts";
import * as routines from "./routine-store.ts";
import { describeSchedule } from "../../shared/routines.ts";
import type { Routine, RoutineSchedule } from "../../shared/routines.ts";
import type { Thread } from "../../shared/protocol.ts";

const LISTED_RUNS = 5;
const CHANGES = new Set(["routine_save", "routine_remove"]);

function targetThread(thread: Thread, args: Record<string, unknown>): string {
  return args.botId === undefined ? thread.id : botStore.get(required(args, "botId")).threadId;
}

function toolSchedule(value: unknown): RoutineSchedule {
  const schedule = value as RoutineSchedule;
  if (schedule?.kind !== "once" || typeof schedule.at !== "string") return schedule;
  return { kind: "once", at: new Date(schedule.at).getTime() };
}

function summary(routine: Routine) {
  return {
    id: routine.id,
    name: routine.name,
    prompt: routine.prompt,
    schedule: routine.schedule,
    when: describeSchedule(routine.schedule),
    paused: routine.paused,
    ...(routine.nextRunAt ? { nextRunAt: new Date(routine.nextRunAt).toISOString() } : {}),
    recentRuns: routine.runs
      .slice(0, LISTED_RUNS)
      .map((run) => ({
        status: run.status,
        startedAt: new Date(run.startedAt).toISOString(),
        ...(run.error ? { error: run.error } : {}),
      })),
  };
}

export function callRoutineTool(
  thread: Thread,
  name: string,
  args: Record<string, unknown>,
): unknown {
  if (CHANGES.has(name) && thread.permissionMode === "plan")
    throw new Error("This action is unavailable in Plan only mode.");
  const threadId = targetThread(thread, args);
  switch (name) {
    case "routine_list":
      return routines.list(threadId).map(summary);
    case "routine_save": {
      if (args.paused !== undefined && typeof args.paused !== "boolean")
        throw new Error("paused must be true or false");
      return summary(
        routines.save(threadId, {
          ...(args.id === undefined ? {} : { id: required(args, "id") }),
          name: required(args, "name"),
          prompt: required(args, "prompt"),
          schedule: toolSchedule(args.schedule),
          paused: args.paused === true,
        }),
      );
    }
    case "routine_remove":
      routines.remove(threadId, required(args, "id"));
      return "Routine deleted.";
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
