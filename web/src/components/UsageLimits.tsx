import type { CSSProperties } from "react";
import type { ProviderUsage, UsageWindow } from "../../../shared/features.ts";
import { providerLabels, until } from "../lib/format.ts";
import { currentLocale, useI18n } from "../lib/i18n.ts";
import type { Translator } from "../lib/translations.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";

const DAY_MS = 86_400_000;

function windowLabel(entry: ProviderUsage, window: UsageWindow, t: Translator): string {
  return window.label
    .split(" · ")
    .filter((part) => part.toLowerCase() !== providerLabels[entry.provider].toLowerCase())
    .map((part) => {
      if (part === "Weekly") return t("Weekly limit");
      const hours = /^(\d+(?:\.\d+)?) hours$/.exec(part);
      if (hours) return t("{hours}-hour limit", { hours: hours[1]! });
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" · ");
}

function resetMoment(resetsAt: number): string {
  const soon = resetsAt - Date.now() < DAY_MS;
  return new Date(resetsAt).toLocaleString(currentLocale(), soon
    ? { hour: "2-digit", minute: "2-digit" }
    : { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function LimitWindow({ entry, window }: { entry: ProviderUsage; window: UsageWindow }) {
  const t = useI18n();
  const left = Math.round(Math.max(0, 100 - window.usedPercent));
  const level = left <= 5 ? "empty" : left <= 20 ? "low" : undefined;
  const label = windowLabel(entry, window, t);
  return (
    <div className="limit-window" data-level={level}>
      <div className="limit-line">
        <span className="truncate" title={label}>{label}</span>
        <strong>{t("{percent}% left", { percent: left })}</strong>
      </div>
      <i style={{ "--left": `${left}%` } as CSSProperties} />
      <div className="limit-line limit-reset">
        {window.resetsAt ? <>
          <span>{t("Resets in {when}", { when: until(window.resetsAt) })}</span>
          <span>{resetMoment(window.resetsAt)}</span>
        </> : <span>{t("No reset time reported")}</span>}
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
      {entry.windows.map((window) => <LimitWindow key={window.label} entry={entry} window={window} />)}
    </section>
  );
}
