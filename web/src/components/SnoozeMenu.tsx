import { useState } from "react";
import { HourglassIcon } from "./icons/status.tsx";
import { Menu } from "./Menu.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { Stepper } from "./Stepper.tsx";
import { organizeConversation } from "./ConversationMenu.tsx";
import { reportError } from "../lib/api.ts";
import { clock, formatDate } from "../lib/format.ts";
import type { ThreadMeta } from "../../../shared/protocol.ts";

const UNITS = {
  minutes: { label: "Minutes", ms: 60_000, max: 525_600 },
  hours: { label: "Hours", ms: 3_600_000, max: 8_760 },
  days: { label: "Days", ms: 86_400_000, max: 365 },
} as const;

type Unit = keyof typeof UNITS;

const wakeLabel = (time: number) =>
  formatDate(time, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function SnoozeMenu({
  thread,
  environment,
  anchor,
  onClose,
}: {
  thread: ThreadMeta;
  environment?: string;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const resetsAt =
    thread.usageLimit?.resetsAt && thread.usageLimit.resetsAt > Date.now()
      ? thread.usageLimit.resetsAt
      : undefined;
  const [unit, setUnit] = useState<Unit>("hours");
  const [amounts, setAmounts] = useState<Record<Unit, string>>({
    minutes: "30",
    hours: "2",
    days: "1",
  });
  const [busy, setBusy] = useState(false);
  const { max, ms } = UNITS[unit];
  const amount = Number(amounts[unit]);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= max;
  const setAmount = (value: string) => setAmounts({ ...amounts, [unit]: value });
  const step = (by: number) =>
    setAmount(String(Math.min(max, Math.max(1, (Number.isInteger(amount) ? amount : 0) + by))));

  const snooze = async (until: number) => {
    setBusy(true);
    try {
      await organizeConversation(thread.id, { snoozedUntil: until }, environment);
      onClose();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu
      anchor={anchor}
      align="end"
      width={240}
      span=".thread-card"
      edge=".rail"
      items={[]}
      onClose={onClose}
      controls={
        <div className="snooze-menu">
          {resetsAt && (
            <>
              <button
                type="button"
                className="menu-item"
                disabled={busy}
                onClick={() => void snooze(resetsAt)}
              >
                <span className="menu-icon">
                  <HourglassIcon size={15} />
                </span>
                <span className="menu-copy">
                  <span className="menu-label truncate">Until usage resets</span>
                  <span className="menu-hint">
                    <span className="truncate">{clock(resetsAt)}</span>
                  </span>
                </span>
              </button>
              <hr className="snooze-divider" />
            </>
          )}
          <div
            className="usage-segmented sliding-selection snooze-units"
            role="group"
            aria-label="Snooze for"
          >
            <SelectionHighlight value={unit} />
            {(Object.keys(UNITS) as Unit[]).map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={unit === entry}
                onClick={() => setUnit(entry)}
              >
                {UNITS[entry].label}
              </button>
            ))}
          </div>
          <form
            className="snooze-stepper"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) void snooze(Date.now() + amount * ms);
            }}
          >
            <Stepper
              label={UNITS[unit].label}
              value={amounts[unit]}
              min={1}
              max={max}
              canIncrease={amount < max}
              canDecrease={amount > 1}
              onInput={setAmount}
              onStep={step}
            />
            <p className="snooze-wake" aria-live="polite">
              {valid
                ? `Wakes ${wakeLabel(Date.now() + amount * ms)}`
                : `Enter a whole number from 1 to ${max}.`}
            </p>
            <button className="btn snooze-submit" data-variant="primary" disabled={busy || !valid}>
              Snooze
            </button>
          </form>
        </div>
      }
    />
  );
}
