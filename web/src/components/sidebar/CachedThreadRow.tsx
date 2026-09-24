import { openOnEnvironment } from "../../lib/actions.ts";
import { api, reportError } from "../../lib/api.ts";
import type { CachedThread } from "../../lib/environment.ts";
import { threadActivity } from "../../lib/format.ts";
import { currentLocale, useI18n } from "../../lib/i18n.ts";
import { confirmAction } from "../../lib/store.ts";
import { ConversationMenu } from "../ConversationMenu.tsx";
import { Check, RotateCcw, Trash2 } from "../icons.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { ThreadPulse } from "../ThreadPulse.tsx";
import { Unplug } from "lucide-react";

export function CachedThreadRow({ thread, categoryEnd, environment, connected, onConversation }: {
  thread: CachedThread;
  categoryEnd: boolean;
  environment: string;
  connected: boolean;
  onConversation: () => void;
}) {
  const t = useI18n();
  const { status, label } = threadActivity({ running: thread.running ?? false, status: thread.status ?? "idle" });
  const open = () => {
    onConversation();
    void openOnEnvironment(environment, thread.projectId, thread.id).catch(reportError);
  };
  const busy = thread.running || thread.status === "awaiting";
  const finishLabel = `${thread.finished ? t("Reopen") : t("Finish")} ${thread.title}`;
  const finish = () => {
    void api(`threads/finish?threadId=${encodeURIComponent(thread.id)}`, { method: "POST", body: JSON.stringify({ finished: !thread.finished }) }, environment).catch(reportError);
  };
  const remove = async () => {
    const confirmed = await confirmAction({
      title: "Delete this conversation?",
      context: thread.title,
      description: "This permanently deletes the conversation and its subagents. Files in your workspace stay on disk.",
      label: "Delete conversation",
      danger: true,
    });
    if (confirmed) await api(`threads?threadId=${encodeURIComponent(thread.id)}`, { method: "DELETE" }, environment).catch(reportError);
  };

  return (
    <div className="thread-entry" data-thread-id={thread.id} data-environment={environment} data-category-end={categoryEnd}>
      <div className="thread-card" data-active={false}>
        <button
          type="button"
          className="thread-row"
          data-active={false}
          aria-label={thread.title}
          aria-description={new Date(thread.updatedAt).toLocaleString(currentLocale())}
          onClick={open}
        >
          <span className="thread-row-body">
            <span className="thread-row-heading">
              <ProviderIcon provider={thread.provider} />
              <span className="thread-row-title">{thread.title}</span>
              {connected ? status !== "idle" && status !== "stopped" && (
                <span className="thread-status" data-status={status} role="img" aria-label={t(label)}>
                  <ThreadPulse status={status} />
                </span>
              ) : <span className="thread-status" role="img" aria-label={t("Disconnected")} title={t("Disconnected")}><Unplug size={12} /></span>}
            </span>
          </span>
        </button>
        {connected && <div className="thread-row-actions">
          <ConversationMenu thread={thread} environment={environment} />
          <button
            className="thread-row-finish"
            type="button"
            title={busy ? t("Stop this conversation before finishing") : finishLabel}
            aria-label={finishLabel}
            disabled={busy}
            onClick={finish}
          >
            {thread.finished ? <RotateCcw size={14} /> : <Check size={15} />}
          </button>
          <button
            className="thread-row-kill"
            type="button"
            aria-label={`${t("Delete")} ${thread.title}`}
            title={`${t("Delete")} ${thread.title}`}
            onClick={() => void remove()}
          >
            <Trash2 size={13} />
          </button>
        </div>}
      </div>
    </div>
  );
}
