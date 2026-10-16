export const ROUTINE_LIMITS = {
  perThread: 50,
  runsKept: 20,
  minIntervalMinutes: 1,
  maxIntervalDays: 90,
  nameLength: 80,
  promptLength: 20_000,
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const TIME_OF_DAY: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const DATE_OF_YEAR: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

export type DateFormat = (ms: number, options: Intl.DateTimeFormatOptions) => string;
const localFormat: DateFormat = (ms, options) => new Date(ms).toLocaleString([], options);

export type RoutineSchedule =
  | { kind: "once"; at: number }
  | { kind: "interval"; minutes: number; days?: number[]; from?: string; to?: string }
  | { kind: "weekly"; days: number[]; time: string }
  | { kind: "monthly"; day: number; time: string };

export type RoutineRunStatus = "running" | "ok" | "error" | "stopped";

export interface RoutineRun {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: RoutineRunStatus;
  test?: boolean;
  error?: string;
}

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  paused: boolean;
  createdAt: number;
  nextRunAt?: number;
  runs: RoutineRun[];
}

export type RoutineDraft = Pick<Routine, "name" | "prompt" | "schedule" | "paused"> & {
  id?: string;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function checkTime(time: unknown): string {
  if (typeof time !== "string" || !TIME.test(time)) throw new Error("Choose a time such as 08:00.");
  return time;
}

function checkDays(days: unknown): number[] {
  const unique = [...new Set(Array.isArray(days) ? days : [])].sort();
  if (!unique.length || unique.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
    throw new Error("Choose at least one day.");
  return unique;
}

function minuteOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

function checkInterval(schedule: Extract<RoutineSchedule, { kind: "interval" }>): RoutineSchedule {
  const most = ROUTINE_LIMITS.maxIntervalDays * 24 * 60;
  if (
    !Number.isInteger(schedule.minutes) ||
    schedule.minutes < ROUTINE_LIMITS.minIntervalMinutes ||
    schedule.minutes > most
  )
    throw new Error(
      `Choose an interval from ${everyLabel(ROUTINE_LIMITS.minIntervalMinutes).toLowerCase()} to ${everyLabel(most).toLowerCase()}.`,
    );
  const days = schedule.days === undefined ? EVERY_DAY : checkDays(schedule.days);
  if ((schedule.from === undefined) !== (schedule.to === undefined))
    throw new Error("Choose both a start and an end time.");
  const window =
    schedule.from === undefined
      ? {}
      : { from: checkTime(schedule.from), to: checkTime(schedule.to) };
  if (window.from && minuteOfDay(window.from) >= minuteOfDay(window.to!))
    throw new Error("Choose an end time after the start time.");
  return {
    kind: "interval",
    minutes: schedule.minutes,
    ...(days.length < EVERY_DAY.length ? { days } : {}),
    ...window,
  };
}

function checkMonthDay(day: unknown): number {
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31)
    throw new Error("Choose a day of the month from 1 to 31.");
  return day as number;
}

export function checkSchedule(schedule: RoutineSchedule): RoutineSchedule {
  switch (schedule?.kind) {
    case "once":
      if (!Number.isFinite(schedule.at)) throw new Error("Choose a date and time.");
      return { kind: "once", at: schedule.at };
    case "interval":
      return checkInterval(schedule);
    case "weekly":
      return { kind: "weekly", days: checkDays(schedule.days), time: checkTime(schedule.time) };
    case "monthly":
      return { kind: "monthly", day: checkMonthDay(schedule.day), time: checkTime(schedule.time) };
    default:
      throw new Error("Choose how often the routine runs.");
  }
}

function atTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function nextDailySlot(days: number[], time: string, after: number): number {
  const start = new Date(after);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = atTime(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset),
      time,
    );
    if (candidate.getTime() > after && days.includes(candidate.getDay()))
      return candidate.getTime();
  }
  throw new Error("This schedule never runs.");
}

function inWindow(schedule: Extract<RoutineSchedule, { kind: "interval" }>, time: number): boolean {
  const date = new Date(time);
  if (schedule.days && !schedule.days.includes(date.getDay())) return false;
  if (!schedule.from || !schedule.to) return true;
  const minute = date.getHours() * 60 + date.getMinutes();
  return minute >= minuteOfDay(schedule.from) && minute <= minuteOfDay(schedule.to);
}

function nextMonthly(day: number, time: string, after: number): number {
  const start = new Date(after);
  for (let offset = 0; offset <= 12; offset++) {
    const lastDay = new Date(start.getFullYear(), start.getMonth() + offset + 1, 0).getDate();
    const candidate = atTime(
      new Date(start.getFullYear(), start.getMonth() + offset, Math.min(day, lastDay)),
      time,
    );
    if (candidate.getTime() > after) return candidate.getTime();
  }
  throw new Error("This schedule never runs.");
}

export function nextRunAfter(schedule: RoutineSchedule, after: number): number | undefined {
  switch (schedule.kind) {
    case "once":
      return schedule.at > after ? schedule.at : undefined;
    case "interval": {
      const next = after + schedule.minutes * 60_000;
      return inWindow(schedule, next)
        ? next
        : nextDailySlot(schedule.days ?? EVERY_DAY, schedule.from ?? "00:00", after);
    }
    case "weekly":
      return nextDailySlot(schedule.days, schedule.time, after);
    case "monthly":
      return nextMonthly(schedule.day, schedule.time, after);
  }
}

export function timeLabel(time: string, format: DateFormat = localFormat): string {
  return format(atTime(new Date(2000, 0, 1), time).getTime(), TIME_OF_DAY);
}

function dayNames(days: number[]): string {
  return WEEK_ORDER.filter((day) => days.includes(day))
    .map((day) => WEEKDAYS[day])
    .join(", ");
}

function daysLabel(days: number[]): string {
  const key = days.join(",");
  if (key === EVERY_DAY.join(",")) return "Every day";
  if (key === "1,2,3,4,5") return "Every weekday";
  if (key === "0,6") return "Every weekend";
  return `Every ${dayNames(days)}`;
}

function windowDaysLabel(days: number[]): string {
  const key = days.join(",");
  if (key === "1,2,3,4,5") return "weekdays";
  if (key === "0,6") return "weekends";
  return `on ${dayNames(days)}`;
}

function everyLabel(minutes: number): string {
  if (minutes % (24 * 60) === 0)
    return minutes === 24 * 60 ? "Every day" : `Every ${minutes / (24 * 60)} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "Every hour" : `Every ${minutes / 60} hours`;
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

export function describeSchedule(
  schedule: RoutineSchedule,
  format: DateFormat = localFormat,
): string {
  switch (schedule.kind) {
    case "once":
      return `Once on ${format(schedule.at, DATE_OF_YEAR)} at ${format(schedule.at, TIME_OF_DAY)}`;
    case "interval": {
      const days = schedule.days ? `, ${windowDaysLabel(schedule.days)}` : "";
      const hours = schedule.from
        ? ` from ${timeLabel(schedule.from, format)} to ${timeLabel(schedule.to!, format)}`
        : "";
      return `${everyLabel(schedule.minutes)}${days}${hours}`;
    }
    case "weekly":
      return `${daysLabel(schedule.days)} at ${timeLabel(schedule.time, format)}`;
    case "monthly":
      return `Day ${schedule.day} of each month at ${timeLabel(schedule.time, format)}`;
  }
}
