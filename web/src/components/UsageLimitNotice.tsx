import { AlarmClockOff, Check, Hourglass, RotateCcw } from "lucide-react";
import { organizeConversation } from "./ConversationMenu.tsx";
import { reportError } from "../lib/api.ts";
import { environmentId } from "../lib/environment.ts";
import { clock, formatDate } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";

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

export function UsageLimitStrip({ threadId }: { threadId: string }) {
  const t = useI18n();
  const thread = useApp((state) => state.threads[threadId]);
  const connected = useApp((state) => state.connected);
  const limit = thread?.usageLimit;
  if (!thread || !limit || thread.running) return null;
  const time = upcoming(limit.resetsAt);
  const snoozed = Boolean(limit.resetsAt && thread.snoozedUntil === limit.resetsAt);
  return (
    <div className="composer-limit" role="group" aria-label={t("Usage limit reached")}>
      <Hourglass size={14} aria-hidden="true" />
      <div className="composer-limit-copy" title={thread.error}>
        <strong>{t("Usage limit reached")}</strong>
        <span>{time ? t("Resets at {time}", { time }) : limit.resetsAt ? t("Checking whether usage is back") : t("Checked every 15 minutes")}</span>
      </div>
      <button
        type="button"
        className="composer-limit-action"
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
          className="composer-limit-action"
          aria-pressed={snoozed}
          disabled={!connected}
          onClick={() => void organizeConversation(threadId, { snoozedUntil: snoozed ? null : limit.resetsAt }, environmentId()).catch(reportError)}
        >
          {snoozed ? <Check size={14} aria-hidden="true" /> : <AlarmClockOff size={14} aria-hidden="true" />}
          {t(snoozed ? "Snoozed until reset" : "Snooze until reset")}
        </button>
      )}
    </div>
  );
}
