import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { useVisibleInterval } from "../lib/use-visible-interval.ts";
import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CollapseIcon } from "./icons/media.tsx";
import { decimal, since, tokens, until } from "../lib/format.ts";
import { scaled, useApp, viewportWidth } from "../lib/store.ts";
import { selectedModel } from "../../../shared/model-options.ts";
import { providerAccount } from "../../../shared/provider-account.ts";
import { estimateTokensFromChars, reportedContext } from "../../../shared/usage-metrics.ts";

const PANEL_WIDTH = 304;
// Above this, re-reading the whole context uncached costs more than compacting it first.
const COMPACT_SUGGESTION_TOKENS = 100_000;

function percentage(value: number): string {
  const percent = Math.max(0, Math.min(value * 100, 100));
  if (percent > 0 && percent < 0.1) return "<0.1";
  return decimal(percent);
}

function exactTokens(value: number): string {
  return decimal(Math.round(value), 0);
}

export const ContextUsage = memo(function ContextUsage({
  onCompact,
  draft = "",
}: {
  onCompact?: () => void;
  draft?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ring = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const uiScale = useApp((state) => state.uiScale);
  const connected = useApp((state) => state.connected);
  const thread = useApp((state) => state.threads[state.activeThreadId ?? ""]);
  const provider = useApp((state) =>
    state.providers.find((entry) => entry.id === thread?.provider),
  );
  const canCompact = provider?.capabilities?.compact !== false;
  const usage = thread?.usage;
  const model = selectedModel(
    providerAccount(provider, thread?.providerInstanceId).models,
    thread?.model,
  );
  const contextMax = (usage?.contextMax || thread?.contextWindow || model?.contextMax) ?? 0;
  const reported = Boolean(usage && reportedContext(usage.contextTokens, contextMax));
  const fresh =
    !thread?.externalId &&
    !thread?.running &&
    !usage?.turns &&
    !(usage?.input || usage?.output || usage?.cacheRead || usage?.cacheWrite || usage?.costUsd);
  const draftTokens = estimateTokensFromChars(draft.length);
  const contextTokens = fresh ? 0 : reported ? (usage?.contextTokens ?? 0) : draftTokens;
  const shown = Boolean(!fresh && (reported || draftTokens > 0));
  const known = Boolean(contextMax > 0 && (shown || fresh));
  const estimatedNote = !reported && shown;
  const fill = known ? Math.max(0, Math.min(contextTokens / contextMax, 1)) : 0;
  const contextPercent = percentage(fill);
  const [, tick] = useState(0);
  const now = Date.now();
  const cacheExpiresAt = usage?.cacheExpiresAt;
  const cacheWarm = cacheExpiresAt !== undefined && cacheExpiresAt > now;
  useVisibleInterval(() => tick((value) => value + 1), 1000, open && cacheWarm);
  const cacheState = cacheExpiresAt === undefined ? undefined : cacheWarm ? "warm" : "cold";
  const suggestCompact =
    cacheState === "cold" &&
    contextTokens >= COMPACT_SUGGESTION_TOKENS &&
    canCompact &&
    Boolean(onCompact);
  const label = known ? `${contextPercent}% context used` : "Context usage";

  useLayoutEffect(() => {
    const panel = details.current;
    const anchor = ring.current;
    if (!open || !panel || !anchor) return;
    panel.showPopover();
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const scale = uiScale / 100;
      const width = Math.min(PANEL_WIDTH, viewportWidth() - 24);
      panel.style.width = `${scaled(width)}px`;
      panel.style.maxHeight = `${scaled(Math.max(0, bounds.top / scale - 20))}px`;
      panel.style.left = `${scaled(Math.max(12, Math.min(bounds.right / scale - width, viewportWidth() - width - 12)))}px`;
      panel.style.top = `${scaled(Math.max(12, (bounds.top - panel.offsetHeight) / scale - 8))}px`;
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(panel);
    resize.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, uiScale]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (ring.current?.contains(event.target) || details.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div
      className="context-usage"
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget
            .querySelector<HTMLButtonElement>(".context-ring")
            ?.focus({ preventScroll: true });
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <button
        ref={ring}
        className="context-ring"
        type="button"
        aria-label={label}
        aria-controls={id}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-hot={fill > 0.8}
        data-connected={connected}
      >
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="12" stroke="var(--line-strong)" strokeWidth="3" />
          <circle
            cx="16"
            cy="16"
            r="12"
            pathLength="100"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${fill * 100} 100`}
            transform="rotate(-90 16 16)"
          />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 4, pointerEvents: "none" }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            ref={details}
            popover="manual"
            className="context-details"
            role="group"
            aria-label="Context usage"
            id={id}
          >
            <section className="context-section context-window" aria-labelledby={`${id}-context`}>
              <div className="context-heading">
                <strong id={`${id}-context`}>Context</strong>
                <span className="context-percentage">
                  {known
                    ? `${contextPercent}% used`
                    : shown
                      ? "Window size unavailable"
                      : "Not reported yet"}
                </span>
              </div>
              <p
                className="context-summary"
                title={
                  known
                    ? `${exactTokens(contextTokens)} of ${exactTokens(contextMax)} tokens`
                    : shown
                      ? `${exactTokens(contextTokens)} tokens used`
                      : undefined
                }
              >
                {known
                  ? `${tokens(contextTokens)} of ${tokens(contextMax)} tokens`
                  : shown
                    ? `${tokens(contextTokens)} tokens used`
                    : contextMax > 0
                      ? `Window size: ${tokens(contextMax)} tokens`
                      : "Usage appears when the provider reports it."}
              </p>
              {known && (
                <div
                  className="context-meter"
                  role="meter"
                  aria-labelledby={`${id}-context`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fill * 100}
                  aria-valuetext={`${exactTokens(contextTokens)} of ${exactTokens(contextMax)} tokens`}
                  data-hot={fill > 0.8}
                >
                  <span style={{ width: `${fill * 100}%` }} />
                </div>
              )}
              {estimatedNote && <p className="context-estimate">Estimated from conversation</p>}
            </section>
            {cacheState && (
              <section
                className="context-section context-cache-timer"
                aria-labelledby={`${id}-cache-timer`}
              >
                <div className="context-heading">
                  <strong id={`${id}-cache-timer`}>Prompt cache</strong>
                  <span className="context-stat-value" data-cache={cacheState}>
                    {cacheWarm
                      ? `Warm · ${until(cacheExpiresAt!, now)} left`
                      : `Expired ${since(cacheExpiresAt!, now)} ago`}
                  </span>
                </div>
                <p className="context-cache-note">
                  {cacheWarm
                    ? "Your next message reuses the saved context at a fraction of the price."
                    : `Your next message re-reads ${tokens(contextTokens)} tokens at full price.${suggestCompact ? " Compacting first makes that smaller." : ""}`}
                </p>
              </section>
            )}
            {thread?.compacting ? (
              <div className="context-compacting" role="status">
                <CollapseIcon size={15} aria-hidden="true" />
                Compacting context…
              </div>
            ) : null}
            {!connected && (
              <div className="context-connection" role="status">
                Reconnecting…
              </div>
            )}
            {!thread?.compacting && thread?.externalId && canCompact && onCompact && (
              <div className="context-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={thread.running || !connected}
                  onClick={onCompact}
                >
                  <CollapseIcon size={15} aria-hidden="true" />
                  Compact context
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
