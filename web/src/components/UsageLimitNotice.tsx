import { Hourglass } from "lucide-react";
import { clock, formatDate } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";

function resetTime(resetsAt: number): string {
  const sameDay = new Date(resetsAt).toDateString() === new Date().toDateString();
  return sameDay ? clock(resetsAt) : formatDate(resetsAt, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function UsageLimitNotice({ threadId, error }: { threadId: string; error: string }) {
  const t = useI18n();
  const limit = useApp((state) => state.threads[threadId]?.usageLimit);
  const connected = useApp((state) => state.connected);
  if (!limit) return null;
  const time = limit.resetsAt && limit.resetsAt > Date.now() ? resetTime(limit.resetsAt) : undefined;
  const status = time
    ? t("Your allowance resets at {time}.", { time })
    : limit.resetsAt
      ? t("The reset time has passed. Citropy is checking whether your allowance is back.")
      : t("The provider did not say when your allowance resets. Citropy checks again every 15 minutes.");
  const detail = !limit.resume
    ? t("Continue this task automatically once the limit resets.")
    : time
      ? t("Continues automatically at {time}.", { time })
      : t("Continues automatically as soon as usage is available.");
  return (
    <section className="usage-limit-notice" aria-label={t("Usage limit reached")}>
      <div className="usage-limit-heading">
        <Hourglass size={16} aria-hidden="true" />
        <strong>{t("Usage limit reached")}</strong>
      </div>
      <p role="status">{status}</p>
      <label className="setting-row usage-limit-resume">
        <span>
          <strong>{t("Resume when usage returns")}</strong>
          <small>{detail}</small>
        </span>
        <input
          className="setting-switch"
          type="checkbox"
          role="switch"
          checked={limit.resume}
          disabled={!connected}
          onChange={(event) => send({ t: "thread.resumeAfterLimit", id: threadId, enabled: event.target.checked })}
        />
      </label>
      <details className="usage-limit-message">
        <summary>{t("Provider message")}</summary>
        <p>{error}</p>
      </details>
    </section>
  );
}
