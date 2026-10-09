import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { UsageReport } from "../../../shared/features.ts";
import { api } from "../lib/api.ts";
import { clock } from "../lib/format.ts";
import { ProviderLimits } from "./UsageLimits.tsx";

const CACHE_MS = 60_000;
const DELAY_MS = 120;

type UsageLimits = Pick<UsageReport, "providers">;

let cached: { at: number; report: UsageLimits } | undefined;
let pending: Promise<UsageLimits> | undefined;

function loadUsage(): Promise<UsageLimits> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.report);
  pending ??= api<UsageLimits>("usage/limits")
    .then((report) => {
      cached = { at: Date.now(), report };
      return report;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function UsageCard({ id, anchor, open }: { id: string; anchor: HTMLElement; open: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState(cached?.report);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    loadUsage().then((next) => {
      if (!live) return;
      setReport(next);
      setError("");
    }).catch((reason: Error) => live && setError(reason.message));
    return () => { live = false; };
  }, [open]);
  useLayoutEffect(() => {
    const element = card.current!;
    if (!element.matches(":popover-open")) element.showPopover();
    if (!open) return;
    const strip = anchor.closest(".navigation-strip")!.getBoundingClientRect();
    const target = anchor.getBoundingClientRect();
    element.style.left = `${strip.right}px`;
    element.style.top = `${Math.max(8, target.bottom - element.offsetHeight)}px`;
  }, [anchor, open, report, error]);

  const providers = report?.providers.filter((entry) => entry.windows.length) ?? [];
  const updated = report ? Math.max(0, ...report.providers.map((entry) => entry.updatedAt)) : 0;

  return (
    <div ref={card} className="usage-peek" popover="manual" data-open={open || undefined}>
      <div id={id} className="usage-peek-card" role="tooltip">
        <header className="usage-peek-header">
          <strong>Usage limits</strong>
          {updated > 0 && <span>Updated {clock(updated)}</span>}
        </header>
        {error ? <p className="usage-peek-note">{error}</p>
          : !report ? <p className="usage-peek-note">Reading provider usage…</p>
          : !providers.length ? <p className="usage-peek-note">No provider limits reported</p>
          : providers.map((entry) => <ProviderLimits key={entry.provider} entry={entry} />)}
      </div>
    </div>
  );
}

type PeekHandler = (event: { currentTarget: HTMLElement }) => void;

export function useUsagePeek(): {
  bind: { onPointerEnter: PeekHandler; onPointerLeave: () => void; onFocus: PeekHandler; onBlur: () => void };
  hide: () => void;
  describedBy?: string;
  card: ReactNode;
} {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement>();
  const [open, setOpen] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const show = (element: HTMLElement, delay: number) => {
    clearTimeout(timer.current);
    loadUsage().catch(() => undefined);
    timer.current = window.setTimeout(() => {
      setAnchor(element);
      setOpen(true);
    }, delay);
  };
  return {
    bind: {
      onPointerEnter: (event) => show(event.currentTarget, DELAY_MS),
      onPointerLeave: hide,
      onFocus: (event) => { if (event.currentTarget.matches(":focus-visible")) show(event.currentTarget, 0); },
      onBlur: hide,
    },
    hide,
    describedBy: open ? id : undefined,
    card: anchor && <UsageCard id={id} anchor={anchor} open={open} />,
  };
}
