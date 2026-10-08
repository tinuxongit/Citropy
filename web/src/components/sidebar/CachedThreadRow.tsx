import { openOnEnvironment } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import type { CachedThread } from "../../lib/environment.ts";
import { dateTime, since } from "../../lib/format.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { DisconnectedIcon } from "../DisconnectedIcon.tsx";

export function CachedThreadRow({ thread, now, environment, showDisconnected, onConversation }: {
  thread: CachedThread;
  now: number;
  showDisconnected: boolean;
  environment: string;
  onConversation: () => void;
}) {
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
          aria-description={dateTime(thread.updatedAt)}
          onClick={open}
        >
          <ProviderIcon provider={thread.provider} />
          <span className="thread-row-title">{thread.title}</span>
          {showDisconnected
            ? <span className="thread-status" role="img" aria-label="Disconnected" title="Disconnected"><DisconnectedIcon size={14} /></span>
            : <time className="thread-row-time" dateTime={new Date(thread.updatedAt).toISOString()}>{since(thread.updatedAt, now)}</time>}
        </button>
      </div>
    </div>
  );
}
