import { routineTime } from "../../lib/routines.ts";
import { useApp } from "../../lib/store.ts";
import { hour12, hour24, joinTime, pad, periodOf, shiftTimeOfDay, timeParts, type DayPeriod } from "../../lib/time-of-day.ts";
import { ChevronDownIcon } from "../icons/chevrons.tsx";
import { Menu } from "../Menu.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { Stepper } from "../Stepper.tsx";

const PICKER_WIDTH = 220;
const MINUTE_STEP = 5;
const PERIODS: { value: DayPeriod; label: string }[] = [
  { value: "am", label: "AM" },
  { value: "pm", label: "PM" },
];

const wholeIn = (text: string, min: number, max: number) => {
  const value = Number(text);
  return text !== "" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
};

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const clock24 = useApp((state) => state.clock24);
  const { hours, minutes } = timeParts(value);
  const period = periodOf(hours);
  const setHour = (text: string) => {
    const hour = clock24 ? wholeIn(text, 0, 23) : wholeIn(text, 1, 12);
    if (hour !== undefined) onChange(joinTime(clock24 ? hour : hour24(hour, period), minutes));
  };
  const setMinute = (text: string) => {
    const minute = wholeIn(text, 0, 59);
    if (minute !== undefined) onChange(joinTime(hours, minute));
  };
  return (
    <Menu
      inline
      width={PICKER_WIDTH}
      items={[]}
      trigger={({ id, open, toggle }) => (
        <button id={id} type="button" className="select time-field" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}, ${routineTime(value)}`} onClick={toggle}>
          <span className="select-label">{routineTime(value)}</span>
          <ChevronDownIcon size={15} className="select-chevron" aria-hidden="true" />
        </button>
      )}
      controls={
        <div className="time-picker">
          {!clock24 && (
            <div className="usage-segmented sliding-selection" role="group" aria-label="Morning or afternoon">
              <SelectionHighlight value={period} />
              {PERIODS.map((entry) => (
                <button key={entry.value} type="button" aria-pressed={period === entry.value} onClick={() => onChange(joinTime(hour24(hour12(hours), entry.value), minutes))}>{entry.label}</button>
              ))}
            </div>
          )}
          <div className="time-picker-steppers">
            <Stepper label="Hour" value={clock24 ? pad(hours) : String(hour12(hours))} min={clock24 ? 0 : 1} max={clock24 ? 23 : 12} onInput={setHour} onStep={(by) => onChange(shiftTimeOfDay(value, by * 60))} />
            <span className="time-picker-colon" aria-hidden="true">:</span>
            <Stepper label="Minute" value={pad(minutes)} min={0} max={59} onInput={setMinute} onStep={(by) => onChange(shiftTimeOfDay(value, by * MINUTE_STEP))} />
          </div>
        </div>
      }
    />
  );
}
