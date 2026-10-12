const DAY_MINUTES = 24 * 60;

export type DayPeriod = "am" | "pm";

export const pad = (value: number) => String(value).padStart(2, "0");

export function joinTime(hours: number, minutes: number): string {
  const total = (((hours * 60 + minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function timeParts(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return { hours, minutes };
}

export function shiftTimeOfDay(time: string, minutes: number): string {
  const parts = timeParts(time);
  return joinTime(parts.hours, parts.minutes + minutes);
}

export const hour12 = (hours: number) => hours % 12 || 12;
export const periodOf = (hours: number): DayPeriod => (hours >= 12 ? "pm" : "am");
export const hour24 = (hour: number, period: DayPeriod) => (hour % 12) + (period === "pm" ? 12 : 0);
