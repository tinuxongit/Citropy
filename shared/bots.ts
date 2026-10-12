export const BOT_LIMITS = {
  bots: 50,
  routinesPerBot: 50,
  runsKept: 20,
  minIntervalMinutes: 5,
  nameLength: 60,
  titleLength: 60,
  descriptionLength: 4000,
  routineNameLength: 80,
  promptLength: 20_000,
  messageLength: 20_000,
  handoffDepth: 8,
};

export const BOT_COLORS = ["purple", "blue", "teal", "green", "yellow", "orange", "red", "pink"] as const;
export type BotColor = typeof BOT_COLORS[number];

export const BOT_SHAPES = ["cloud", "drop", "pebble", "block"] as const;
export type BotShape = typeof BOT_SHAPES[number];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type RoutineSchedule =
  | { kind: "interval"; minutes: number }
  | { kind: "weekly"; days: number[]; time: string };

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

export interface Bot {
  id: string;
  name: string;
  title: string;
  description: string;
  color: BotColor;
  shape: BotShape;
  threadId: string;
  notifications: boolean;
  pinned: boolean;
  hidden: boolean;
  profileUpdatedAt: number;
  briefedAt?: number;
  createdAt: number;
  routines: Routine[];
}

export type BotProfile = Pick<Bot, "name" | "title" | "description" | "color" | "shape" | "notifications" | "pinned" | "hidden">;

export type RoutineDraft = Pick<Routine, "name" | "prompt" | "schedule" | "paused"> & { id?: string };

export type MessageOrigin =
  | { kind: "bot"; threadId: string; botId?: string; name: string; depth: number }
  | { kind: "routine"; routineId: string; runId: string; name: string };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function checkSchedule(schedule: RoutineSchedule): RoutineSchedule {
  if (schedule?.kind === "interval") {
    if (!Number.isInteger(schedule.minutes) || schedule.minutes < BOT_LIMITS.minIntervalMinutes || schedule.minutes > 7 * 24 * 60)
      throw new Error(`Run a routine at most every ${BOT_LIMITS.minIntervalMinutes} minutes and at least once a week.`);
    return { kind: "interval", minutes: schedule.minutes };
  }
  if (schedule?.kind === "weekly") {
    if (typeof schedule.time !== "string" || !TIME.test(schedule.time)) throw new Error("Choose a time such as 08:00.");
    const days = [...new Set(schedule.days)].sort();
    if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("Choose at least one day.");
    return { kind: "weekly", days, time: schedule.time };
  }
  throw new Error("Choose how often the routine runs.");
}

export function nextRunAfter(schedule: RoutineSchedule, after: number): number {
  if (schedule.kind === "interval") return after + schedule.minutes * 60_000;
  const [hours, minutes] = schedule.time.split(":").map(Number) as [number, number];
  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setHours(hours, minutes);
  for (let day = 0; day <= 7; day++) {
    if (candidate.getTime() > after && schedule.days.includes(candidate.getDay())) return candidate.getTime();
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(hours, minutes);
  }
  throw new Error("This schedule never runs.");
}

function clockLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function daysLabel(days: number[]): string {
  const key = days.join(",");
  if (key === "0,1,2,3,4,5,6") return "Every day";
  if (key === "1,2,3,4,5") return "Every weekday";
  if (key === "0,6") return "Every weekend";
  return `Every ${days.map(day => WEEKDAYS[day]).join(", ")}`;
}

export function describeSchedule(schedule: RoutineSchedule): string {
  if (schedule.kind === "weekly") return `${daysLabel(schedule.days)} at ${clockLabel(schedule.time)}`;
  const { minutes } = schedule;
  if (minutes % (24 * 60) === 0) return minutes === 24 * 60 ? "Every day" : `Every ${minutes / (24 * 60)} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "Every hour" : `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}
