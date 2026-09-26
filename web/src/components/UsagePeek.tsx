import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { UsageReport } from "../../../shared/features.ts";
import { api } from "../lib/api.ts";
import { clock } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.ts";
import { ProviderLimits } from "./UsageLimits.tsx";

const CACHE_MS = 60_000;
const DELAY_MS = 350;

let cached: { at: number; report: UsageReport } | undefined;
let pending: Promise<UsageReport> | undefined;

function loadUsage(): Promise<UsageReport> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.report);
  pending ??= api<UsageReport>("usage")
    .then((report) => {
      cached = { at: Date.now(), report };
      return report;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function UsageCard({ id, anchor, side }: { id: string; anchor: HTMLElement; side: "right" | "top" }) {
  const t = useI18n();
  const card = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState(cached?.report);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    loadUsage().then((next) => live && setReport(next)).catch((reason: Error) => live && setError(reason.message));
    return () => { live = false; };
  }, []);
  useLayoutEffect(() => {
    const element = card.current!;
    if (!element.matches(":popover-open")) element.showPopover();
    const target = anchor.getBoundingClientRect();
    const height = element.offsetHeight;
    const width = element.offsetWidth;
    const left = side === "right" ? target.right + 8 : target.left;
    const top = side === "right" ? target.bottom - height : target.top - height - 8;
    element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, top)}px`;
  }, [anchor, side, report, error]);

  const providers = report?.providers.filter((entry) => entry.windows.length) ?? [];
  const updated = report ? Math.max(0, ...report.providers.map((entry) => entry.updatedAt)) : 0;

  return (
    <div ref={card} id={id} className="usage-peek" popover="manual" role="tooltip">
      <header className="usage-peek-header">
        <strong>{t("Usage limits")}</strong>
        {updated > 0 && <span>{t("Updated {time}", { time: clock(updated) })}</span>}
      </header>
      {error ? <p className="usage-peek-note">{error}</p>
        : !report ? <p className="usage-peek-note">{t("Reading provider usage…")}</p>
        : !providers.length ? <p className="usage-peek-note">{t("No provider limits reported")}</p>
        : providers.map((entry) => <ProviderLimits key={entry.provider} entry={entry} />)}
      <footer className="usage-peek-footer">{t("Click for token totals and history")}</footer>
    </div>
  );
}

type PeekHandler = (event: { currentTarget: HTMLElement }) => void;

export function useUsagePeek(side: "right" | "top"): {
  bind: { onPointerEnter: PeekHandler; onPointerLeave: () => void; onFocus: PeekHandler; onBlur: () => void };
  hide: () => void;
  describedBy?: string;
  card: ReactNode;
} {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement>();
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => {
    clearTimeout(timer.current);
    setAnchor(undefined);
  };
  const show = (element: HTMLElement, delay: number) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnchor(element), delay);
  };
  return {
    bind: {
      onPointerEnter: (event) => show(event.currentTarget, DELAY_MS),
      onPointerLeave: hide,
      onFocus: (event) => { if (event.currentTarget.matches(":focus-visible")) show(event.currentTarget, 0); },
      onBlur: hide,
    },
    hide,
    describedBy: anchor ? id : undefined,
    card: anchor && <UsageCard id={id} anchor={anchor} side={side} />,
  };
}
