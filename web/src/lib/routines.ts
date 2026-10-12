import { describeSchedule, timeLabel, type Routine, type RoutineDraft, type RoutineSchedule } from "../../../shared/routines.ts";
import { formatDate, until } from "./format.ts";
import { awaitResponse } from "./requests.ts";
import { requestId, send } from "./socket.ts";
import { confirmAction } from "./store.ts";

export function saveRoutine(threadId: string, routine: RoutineDraft): Promise<string> {
  const id = requestId();
  const response = awaitResponse<string>(id);
  send({ t: "routine.save", requestId: id, threadId, routine });
  return response;
}

export async function removeRoutine(threadId: string, routine: Routine): Promise<boolean> {
  const confirmed = await confirmAction({
    title: `Delete ${routine.name}?`,
    description: "This deletes the routine and its run history.",
    label: "Delete",
    danger: true,
  });
  if (confirmed) send({ t: "routine.remove", threadId, id: routine.id });
  return confirmed;
}

export function scheduleText(schedule: RoutineSchedule): string {
  return describeSchedule(schedule, formatDate);
}

export function routineTime(time: string): string {
  return timeLabel(time, formatDate);
}

export function routineStatus(routine: Routine): string {
  if (routine.paused) return "Paused";
  if (routine.nextRunAt) return `Next in ${until(routine.nextRunAt)}`;
  return routine.schedule.kind === "once" ? "Done" : "";
}

export function runRoutine(threadId: string, id: string): void {
  send({ t: "routine.run", threadId, id });
}
