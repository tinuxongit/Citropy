import { AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { useVisibleInterval } from "../lib/use-visible-interval.ts";
import { memo, useEffect, useId, useRef, useState } from "react";
import { CollapseIcon } from "./icons/media.tsx";
import { ComposerWideTab } from "./composer/ComposerWideTab.tsx";
import { decimal, since, tokens, until } from "../lib/format.ts";
import { useApp } from "../lib/store.ts";
import { selectedModel } from "../../../shared/model-options.ts";
import { providerAccount } from "../../../shared/provider-account.ts";
import { estimateTokensFromChars, reportedContext } from "../../../shared/usage-metrics.ts";

// Long enough to cross the composer from the ring to the panel above it.
const CLOSE_DELAY_MS = 250;
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
  const [open, setOpen] = useState(false);
  const [tabList, setTabList] = useState<HTMLElement | null>(null);
  const id = useId();
  const ring = useRef<HTMLButtonElement>(null);
  const closing = useRef(0);
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

  // The details open as a tab on the composer, like its other tabs, rather than a floating card.
  useEffect(() => {
    setTabList(
      ring.current
        ?.closest(".composer-shell")
        ?.querySelector<HTMLElement>(":scope > .composer-tabs") ?? null,
    );
  }, []);
  useEffect(() => () => clearTimeout(closing.current), []);
  const inside = (target: EventTarget | null) =>
    target instanceof Node &&
    Boolean(
      ring.current?.parentElement?.contains(target) ||
      document.getElementById(id)?.contains(target),
    );
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const show = () => {
    clearTimeout(closing.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(closing.current);
    closing.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <div
      className="context-usage"
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setOpen(true);
      }}
      onBlur={(event) => {
        if (!inside(event.relatedTarget)) setOpen(false);
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
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
      {tabList &&
        createPortal(
          <AnimatePresence>
            {open && (
              <ComposerWideTab
                key="context"
                className="context-details"
                role="group"
                aria-label="Context usage"
                id={id}
                onMouseEnter={show}
                onMouseLeave={hide}
              >
                <section
                  className="context-section context-window"
                  aria-labelledby={`${id}-context`}
                >
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
              </ComposerWideTab>
            )}
          </AnimatePresence>,
          tabList,
        )}
    </div>
  );
});
