import { openOnEnvironment } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import type { CachedThread } from "../../lib/environment.ts";
import { threadActivity } from "../../lib/format.ts";
import { currentLocale, useI18n } from "../../lib/i18n.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { ThreadPulse } from "../ThreadPulse.tsx";
import { Unplug } from "lucide-react";

export function CachedThreadRow({ thread, environment, connected, onConversation }: {
  thread: CachedThread;
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

  return (
    <div className="thread-entry" data-thread-id={thread.id} data-environment={environment}>
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
      </div>
    </div>
  );
}
