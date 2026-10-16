import { useState, type ReactNode } from "react";
import {
  EVERY_DAY,
  TIME_OF_DAY,
  WEEKDAYS,
  WEEK_ORDER,
  checkSchedule,
  nextRunAfter,
  type RoutineSchedule,
} from "../../../../shared/routines.ts";
import { dayInSentence, formatDate } from "../../lib/format.ts";
import { scheduleText } from "../../lib/routines.ts";
import { Select } from "../Select.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { TimeField } from "./TimeField.tsx";

const UNITS = [
  { value: "minutes", label: "Minutes", minutes: 1 },
  { value: "hours", label: "Hours", minutes: 60 },
  { value: "days", label: "Days", minutes: 24 * 60 },
];
const DEFAULTS = {
  days: [1, 2, 3, 4, 5],
  time: "09:00",
  intervalMinutes: 60,
  monthDay: 1,
  from: "09:00",
  to: "17:00",
};
const SHORTEST_MONTH = 28;
const HOUR_MS = 3_600_000;

export type ScheduleTab = "once" | "daily" | "weekly" | "monthly" | "interval";

const SCHEDULE_TABS: { value: ScheduleTab; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "interval", label: "Interval" },
];

function tabOf(schedule: RoutineSchedule): ScheduleTab {
  return schedule.kind === "weekly" && schedule.days.length === EVERY_DAY.length
    ? "daily"
    : schedule.kind;
}

export function newSchedule(tab: ScheduleTab, time = DEFAULTS.time): RoutineSchedule {
  switch (tab) {
    case "interval":
      return { kind: "interval", minutes: DEFAULTS.intervalMinutes };
    case "daily":
      return { kind: "weekly", days: EVERY_DAY, time };
    case "weekly":
      return { kind: "weekly", days: DEFAULTS.days, time };
    case "monthly":
      return { kind: "monthly", day: DEFAULTS.monthDay, time };
    case "once":
      return { kind: "once", at: new Date(Date.now() + HOUR_MS).setMinutes(0, 0, 0) };
  }
}

function intervalParts(minutes: number): { count: number; unit: string } {
  const unit = [...UNITS].reverse().find((entry) => minutes % entry.minutes === 0) ?? UNITS[0]!;
  return { count: minutes / unit.minutes, unit: unit.value };
}

function localInput(ms: number): string {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="routine-label">{label}</span>
      <div className="routine-row">{children}</div>
    </>
  );
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const toggle = (index: number) =>
    onChange(
      days.includes(index) ? days.filter((entry) => entry !== index) : [...days, index].sort(),
    );
  return (
    <div className="routine-days" role="group" aria-label="Days">
      {WEEK_ORDER.map((day) => (
        <button
          key={day}
          type="button"
          className="routine-day"
          aria-pressed={days.includes(day)}
          onClick={() => toggle(day)}
        >
          {WEEKDAYS[day]}
        </button>
      ))}
    </div>
  );
}

function IntervalFields({
  schedule,
  onChange,
}: {
  schedule: Extract<RoutineSchedule, { kind: "interval" }>;
  onChange: (schedule: RoutineSchedule) => void;
}) {
  const { count, unit } = intervalParts(schedule.minutes);
  const setEvery = (nextCount: number, nextUnit: string) =>
    onChange({
      ...schedule,
      minutes: nextCount * UNITS.find((entry) => entry.value === nextUnit)!.minutes,
    });
  const { from, to, ...always } = schedule;
  return (
    <>
      <Field label="Every">
        <input
          type="number"
          aria-label="How many"
          min={1}
          required
          value={count}
          onChange={(event) => setEvery(Number(event.target.value), unit)}
        />
        <Select
          aria-label="Unit"
          width={120}
          options={UNITS}
          value={unit}
          onChange={(next) => setEvery(count, next)}
        />
      </Field>
      <Field label="On">
        <DayPicker
          days={schedule.days ?? EVERY_DAY}
          onChange={(days) => onChange({ ...schedule, days })}
        />
      </Field>
      <Field label="Hours">
        <label className="routine-check">
          <input
            type="checkbox"
            checked={Boolean(from)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? { ...schedule, from: DEFAULTS.from, to: DEFAULTS.to }
                  : always,
              )
            }
          />
          <span>Only during set hours</span>
        </label>
      </Field>
      {from && to && (
        <Field label="From">
          <TimeField
            label="Start time"
            value={from}
            onChange={(next) => onChange({ ...schedule, from: next })}
          />
          <span>to</span>
          <TimeField
            label="End time"
            value={to}
            onChange={(next) => onChange({ ...schedule, to: next })}
          />
        </Field>
      )}
    </>
  );
}

function OnceFields({
  at,
  onChange,
}: {
  at: number;
  onChange: (schedule: RoutineSchedule) => void;
}) {
  const [parts, setParts] = useState(() => {
    const [date, time] = localInput(at).split("T") as [string, string];
    return { date, time };
  });
  const update = (next: Partial<typeof parts>) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange({ kind: "once", at: new Date(`${merged.date}T${merged.time}`).getTime() });
  };
  return (
    <>
      <Field label="On">
        <input
          type="date"
          aria-label="Date"
          required
          value={parts.date}
          onChange={(event) => update({ date: event.target.value })}
        />
      </Field>
      <Field label="At">
        <TimeField label="Time" value={parts.time} onChange={(time) => update({ time })} />
      </Field>
    </>
  );
}

function KindFields({
  tab,
  schedule,
  onChange,
}: {
  tab: ScheduleTab;
  schedule: RoutineSchedule;
  onChange: (schedule: RoutineSchedule) => void;
}) {
  switch (schedule.kind) {
    case "interval":
      return <IntervalFields schedule={schedule} onChange={onChange} />;
    case "weekly":
      return (
        <>
          {tab === "weekly" && (
            <Field label="On">
              <DayPicker
                days={schedule.days}
                onChange={(days) => onChange({ ...schedule, days })}
              />
            </Field>
          )}
          <Field label="At">
            <TimeField
              label="Time"
              value={schedule.time}
              onChange={(time) => onChange({ ...schedule, time })}
            />
          </Field>
        </>
      );
    case "monthly":
      return (
        <>
          <Field label="Day">
            <input
              type="number"
              aria-label="Day of the month"
              min={1}
              max={31}
              required
              value={schedule.day}
              onChange={(event) => onChange({ ...schedule, day: Number(event.target.value) })}
            />
            {schedule.day > SHORTEST_MONTH && (
              <small className="routine-hint">Shorter months run on their last day.</small>
            )}
          </Field>
          <Field label="At">
            <TimeField
              label="Time"
              value={schedule.time}
              onChange={(time) => onChange({ ...schedule, time })}
            />
          </Field>
        </>
      );
    case "once":
      return <OnceFields at={schedule.at} onChange={onChange} />;
  }
}

function Summary({ schedule, paused }: { schedule: RoutineSchedule; paused: boolean }) {
  let valid: RoutineSchedule;
  try {
    valid = checkSchedule(schedule);
  } catch (error) {
    return (
      <p className="routine-summary" data-invalid>
        <small>{(error as Error).message}</small>
      </p>
    );
  }
  const next = nextRunAfter(valid, Date.now());
  return (
    <p className="routine-summary">
      {valid.kind !== "once" && <span>{scheduleText(valid)}</span>}
      <small>
        {paused
          ? "Paused"
          : next
            ? `Next run ${dayInSentence(next)} at ${formatDate(next, TIME_OF_DAY)}`
            : "This time has already passed"}
      </small>
    </p>
  );
}

export function ScheduleFields({
  schedule,
  saved,
  paused = false,
  onChange,
}: {
  schedule: RoutineSchedule;
  saved?: RoutineSchedule;
  paused?: boolean;
  onChange: (schedule: RoutineSchedule) => void;
}) {
  const [tab, setTab] = useState(() => tabOf(schedule));
  const pick = (next: ScheduleTab) => {
    setTab(next);
    onChange(
      saved && tabOf(saved) === next
        ? saved
        : newSchedule(next, "time" in schedule ? schedule.time : undefined),
    );
  };
  return (
    <fieldset className="routine-schedule">
      <legend>Schedule</legend>
      <div className="segmented-tabs sliding-selection" role="tablist" aria-label="Schedule type">
        <SelectionHighlight value={tab} />
        {SCHEDULE_TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={entry.value === tab}
            onClick={() => pick(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="routine-grid">
        <KindFields tab={tab} schedule={schedule} onChange={onChange} />
      </div>
      <Summary schedule={schedule} paused={paused} />
    </fieldset>
  );
}
