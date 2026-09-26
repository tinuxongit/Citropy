import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlarmClockOff, Check, Hourglass, RotateCcw } from "lucide-react";
import { organizeConversation } from "./ConversationMenu.tsx";
import { reportError } from "../lib/api.ts";
import { environmentId } from "../lib/environment.ts";
import { clock, formatDate } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { useAnchoredPanel, useDismiss } from "../lib/use-anchored-panel.ts";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";

function resetTime(resetsAt: number): string {
  const sameDay = new Date(resetsAt).toDateString() === new Date().toDateString();
  return sameDay ? clock(resetsAt) : formatDate(resetsAt, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function upcoming(resetsAt: number | undefined): string | undefined {
  return resetsAt && resetsAt > Date.now() ? resetTime(resetsAt) : undefined;
}

export function UsageLimitLine({ threadId }: { threadId: string }) {
  const t = useI18n();
  const limit = useApp((state) => state.threads[threadId]?.usageLimit);
  const error = useApp((state) => state.threads[threadId]?.error);
  if (!limit) return null;
  const time = upcoming(limit.resetsAt);
  return (
    <p className="thread-limit" role="status" title={error}>
      <Hourglass size={15} aria-hidden="true" />
      <span>{time ? t("Usage limit reached. Resets at {time}.", { time }) : t("Usage limit reached.")}</span>
    </p>
  );
}

export function UsageLimitTab({ threadId }: { threadId: string }) {
  const t = useI18n();
  const thread = useApp((state) => state.threads[threadId]);
  const connected = useApp((state) => state.connected);
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const limit = thread?.usageLimit;
  const visible = Boolean(thread && limit && !thread.running);
  useAnchoredPanel(panel, trigger, { open: open && visible, width: 300 });
  useDismiss(panel, trigger, close, { open: open && visible, outside: true });
  if (!thread || !limit || !visible) return null;
  const time = upcoming(limit.resetsAt);
  const snoozed = Boolean(limit.resetsAt && thread.snoozedUntil === limit.resetsAt);
  const status = time
    ? t("Your allowance resets at {time}.", { time })
    : limit.resetsAt
      ? t("The reset time has passed. Citropy is checking whether usage is back.")
      : t("The provider did not say when usage resets. Citropy checks every 15 minutes.");
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="composer-tab"
        data-tone="warn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t("Usage limit reached")}
        title={thread.error}
        onClick={() => setOpen((value) => !value)}
      >
        {limit.resume ? <Check size={13} aria-hidden="true" /> : <Hourglass size={13} aria-hidden="true" />}
        {time ?? t("Usage limit")}
      </button>
      <AnimatePresence>{open && <motion.section
        ref={panel}
        id={id}
        popover="manual"
        role="dialog"
        aria-label={t("Usage limit reached")}
        className="tab-panel usage-limit-panel"
        initial={{ opacity: 0, transform: reducedMotion ? "none" : "translateY(5px)" }}
        animate={{ opacity: 1, transform: "none" }}
        exit={{ opacity: 0, transform: reducedMotion ? "none" : "translateY(5px)", pointerEvents: "none" }}
        transition={{ duration: reducedMotion ? 0 : 0.16 }}
      >
        <header>
          <Hourglass size={15} aria-hidden="true" />
          <h2>{t("Usage limit reached")}</h2>
        </header>
        <p>{status}</p>
        {thread.error && <p className="usage-limit-message">{thread.error}</p>}
        <div className="usage-limit-actions">
          <button
            type="button"
            className="usage-limit-action"
            aria-pressed={limit.resume}
            disabled={!connected}
            onClick={() => send({ t: "thread.resumeAfterLimit", id: threadId, enabled: !limit.resume })}
          >
            {limit.resume ? <Check size={14} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
            {t(limit.resume ? "Resuming at reset" : "Resume at reset")}
          </button>
          {time && (
            <button
              type="button"
              className="usage-limit-action"
              aria-pressed={snoozed}
              disabled={!connected}
              onClick={() => void organizeConversation(threadId, { snoozedUntil: snoozed ? null : limit.resetsAt }, environmentId()).catch(reportError)}
            >
              {snoozed ? <Check size={14} aria-hidden="true" /> : <AlarmClockOff size={14} aria-hidden="true" />}
              {t(snoozed ? "Snoozed until reset" : "Snooze until reset")}
            </button>
          )}
        </div>
      </motion.section>}</AnimatePresence>
    </>
  );
}
