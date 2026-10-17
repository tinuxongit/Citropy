import type { CSSProperties } from "react";
import type { ProviderUsage, UsageWindow } from "../../../shared/features.ts";
import { clock, formatDate, providerLabels, until } from "../lib/format.ts";
import { ProviderIcon } from "./icons/ProviderIcon.tsx";

const DAY_MS = 86_400_000;

function windowLabel(entry: ProviderUsage, window: UsageWindow): string {
  return window.label
    .split(" · ")
    .filter((part) => part.toLowerCase() !== providerLabels[entry.provider].toLowerCase())
    .map((part) => {
      if (part === "Weekly") return "Weekly limit";
      const hours = /^(\d+(?:\.\d+)?) hours$/.exec(part);
      if (hours) return `${hours[1]!}-hour limit`;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" · ");
}

function resetMoment(resetsAt: number): string {
  const soon = resetsAt - Date.now() < DAY_MS;
  return formatDate(
    resetsAt,
    soon
      ? { hour: "2-digit", minute: "2-digit" }
      : { weekday: "short", hour: "2-digit", minute: "2-digit" },
  );
}

const SPEED_LABELS = { fast: "Fast", steady: "Steady", light: "Light" };

// Before this much of a window has passed, its average says little about where it ends.
const EARLY_SHARE = 0.05;

/** Compares spend against the clock, like T3 Code's pace: within 5 points of the clock is steady. */
function pace(window: UsageWindow, now: number) {
  if (!window.resetsAt || !window.minutes) return undefined;
  const length = window.minutes * 60_000;
  const elapsed = Math.max(0, Math.min(1, 1 - (window.resetsAt - now) / length));
  const gap = window.usedPercent - elapsed * 100;
  const speed: keyof typeof SPEED_LABELS = gap > 5 ? "fast" : gap < -5 ? "light" : "steady";
  let note: string | undefined;
  if (window.usedPercent >= 1 && window.usedPercent < 100 && elapsed >= EARLY_SHARE) {
    const runsOut = now + ((100 - window.usedPercent) * elapsed * length) / window.usedPercent;
    if (runsOut < window.resetsAt)
      note = `runs out ${runsOut - now < DAY_MS ? `around ${clock(runsOut)}` : resetMoment(runsOut)}, ${until(window.resetsAt, runsOut)} before reset`;
    else if (speed === "steady") note = "lasts until reset";
    else note = `about ${Math.round(100 - window.usedPercent / elapsed)}% left at reset`;
  }
  return { speed, mark: 100 - elapsed * 100, note };
}

function LimitWindow({ entry, window }: { entry: ProviderUsage; window: UsageWindow }) {
  const left = Math.round(Math.max(0, 100 - window.usedPercent));
  const level = left <= 5 ? "empty" : left <= 20 ? "low" : undefined;
  const label = windowLabel(entry, window);
  const paced = pace(window, Date.now());
  return (
    <div className="limit-window" data-level={level} data-pace={paced?.speed}>
      <div className="limit-line">
        <span className="truncate" title={label}>
          {label}
        </span>
        <strong>
          {left}%<span> left</span>
        </strong>
      </div>
      <i
        style={
          {
            "--left": `${left}%`,
            ...(paced ? { "--pace": `${paced.mark}%` } : {}),
          } as CSSProperties
        }
      />
      {paced?.note && (
        <div className="limit-line limit-pace" title="Estimated from your average pace so far">
          <span>
            <b>{SPEED_LABELS[paced.speed]}</b> · {paced.note}
          </span>
        </div>
      )}
      <div className="limit-line limit-reset">
        {window.resetsAt ? (
          <>
            <span>Resets in {until(window.resetsAt)}</span>
            <span>{resetMoment(window.resetsAt)}</span>
          </>
        ) : (
          <span>No reset time reported</span>
        )}
      </div>
    </div>
  );
}

export function ProviderLimits({ entry }: { entry: ProviderUsage }) {
  return (
    <section className="limit-card">
      <h3>
        <ProviderIcon provider={entry.provider} />
        <span className="truncate">{providerLabels[entry.provider]}</span>
        {entry.plan && <span className="limit-plan">{entry.plan}</span>}
      </h3>
      {entry.windows.map((window) => (
        <LimitWindow key={window.label} entry={entry} window={window} />
      ))}
    </section>
  );
}
