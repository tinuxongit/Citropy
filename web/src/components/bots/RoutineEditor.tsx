import { useState } from "react";
import { BOT_LIMITS, WEEKDAYS, type Bot, type Routine, type RoutineDraft, type RoutineSchedule } from "../../../../shared/bots.ts";
import { reportError } from "../../lib/api.ts";
import { removeRoutine, runRoutine, saveRoutine } from "../../lib/bots.ts";
import { clock, day } from "../../lib/format.ts";
import { Select } from "../Select.tsx";

const UNITS = [
  { value: "minutes", label: "Minutes", minutes: 1 },
  { value: "hours", label: "Hours", minutes: 60 },
  { value: "days", label: "Days", minutes: 24 * 60 },
];
const NEW_ROUTINE: RoutineDraft = { name: "", prompt: "", schedule: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" }, paused: false };
const KINDS = [
  { value: "weekly", label: "On certain days" },
  { value: "interval", label: "Every few minutes, hours or days" },
];
const FALLBACK_SCHEDULE: Record<RoutineSchedule["kind"], RoutineSchedule> = {
  weekly: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" },
  interval: { kind: "interval", minutes: 60 },
};
const RUN_LABELS: Record<Routine["runs"][number]["status"], string> = { running: "Running", ok: "Finished", error: "Failed", stopped: "Stopped" };

function intervalParts(minutes: number): { count: number; unit: string } {
  const unit = [...UNITS].reverse().find((entry) => minutes % entry.minutes === 0) ?? UNITS[0]!;
  return { count: minutes / unit.minutes, unit: unit.value };
}

export function RoutineEditor({ bot, routine, onDone, onSaved }: { bot: Bot; routine?: Routine; onDone: () => void; onSaved: (id: string) => void }) {
  const [draft, setDraft] = useState<RoutineDraft>(routine ? { id: routine.id, name: routine.name, prompt: routine.prompt, schedule: routine.schedule, paused: routine.paused } : NEW_ROUTINE);
  const [saving, setSaving] = useState(false);
  const schedule = draft.schedule;
  const interval = schedule.kind === "interval" ? intervalParts(schedule.minutes) : undefined;
  const setSchedule = (next: RoutineSchedule) => setDraft({ ...draft, schedule: next });
  const setInterval = (count: number, unit: string) =>
    setSchedule({ kind: "interval", minutes: count * UNITS.find((entry) => entry.value === unit)!.minutes });
  const toggleDay = (index: number) => {
    if (schedule.kind !== "weekly") return;
    const days = schedule.days.includes(index) ? schedule.days.filter((entry) => entry !== index) : [...schedule.days, index].sort();
    setSchedule({ ...schedule, days });
  };
  const save = () => {
    setSaving(true);
    const known = new Set(bot.routines.map((entry) => entry.id));
    void saveRoutine(bot.id, draft)
      .then((saved) => onSaved(draft.id ?? saved.routines.find((entry) => !known.has(entry.id))!.id))
      .catch(reportError)
      .finally(() => setSaving(false));
  };
  return (
    <form className="bot-settings routine-editor" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <label className="feature-field">
        <span>Name</span>
        <input required maxLength={BOT_LIMITS.routineNameLength} placeholder="Morning briefing" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </label>
      <label className="feature-field">
        <span>Instructions</span>
        <textarea required rows={6} maxLength={BOT_LIMITS.promptLength} placeholder="What should the bot do each time this runs?" value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} />
      </label>
      <div className="feature-field">
        <span>Schedule</span>
        <Select aria-label="Schedule type" width={260} options={KINDS} value={schedule.kind}
          onChange={(kind) => setSchedule(routine?.schedule.kind === kind ? routine.schedule : FALLBACK_SCHEDULE[kind as RoutineSchedule["kind"]])} />
      </div>
      {schedule.kind === "weekly" ? (
        <div className="routine-weekly">
          <div className="routine-days" role="group" aria-label="Days">
            {WEEKDAYS.map((label, index) => (
              <button key={label} type="button" className="routine-day" aria-pressed={schedule.days.includes(index)} onClick={() => toggleDay(index)}>{label}</button>
            ))}
          </div>
          <input type="time" aria-label="Time" required value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} />
        </div>
      ) : interval && (
        <div className="routine-interval">
          <span>Every</span>
          <input type="number" aria-label="How many" min={1} required value={interval.count} onChange={(event) => setInterval(Number(event.target.value), interval.unit)} />
          <Select aria-label="Unit" width={140} options={UNITS} value={interval.unit} onChange={(unit) => setInterval(interval.count, unit)} />
        </div>
      )}
      <label className="bot-notify">
        <span>
          <strong>Paused</strong>
          <small>Paused routines keep their settings but don't run</small>
        </span>
        <input className="setting-switch" type="checkbox" role="switch" checked={draft.paused} onChange={(event) => setDraft({ ...draft, paused: event.target.checked })} />
      </label>
      <div className="routine-actions">
        <button type="submit" className="btn" data-variant="primary" disabled={saving}>Save</button>
        {routine && <button type="button" className="btn" data-variant="ghost" onClick={() => runRoutine(bot.id, routine.id)}>Test run</button>}
        {routine && <button type="button" className="btn" data-variant="danger" onClick={() => { removeRoutine(bot.id, routine.id); onDone(); }}>Delete</button>}
      </div>
      {routine && routine.runs.length > 0 && (
        <section className="routine-runs" aria-label="Recent runs">
          <h3 className="bot-section-title">Recent runs</h3>
          {routine.runs.map((run) => (
            <div key={run.id} className="routine-run">
              <span className="bot-run-dot" data-status={run.status} />
              <span className="routine-run-text">
                <span>{RUN_LABELS[run.status]}{run.test ? " · Test" : ""}</span>
                <time>{day(run.startedAt)} {clock(run.startedAt)}</time>
                {run.error && <small className="routine-run-error">{run.error}</small>}
              </span>
            </div>
          ))}
        </section>
      )}
    </form>
  );
}
