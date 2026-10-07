import { Attachments } from "./Attachments.tsx";
import { memo, useState } from "react";
import { PartView } from "./PartView.tsx";
import { WorkGroup } from "./WorkGroup.tsx";
import { WorkDetails } from "./WorkDetails.tsx";
import { Working } from "./Working.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { UserBubble } from "./UserBubble.tsx";
import type { TimelineRow } from "../lib/timeline.ts";
import { useApp } from "../lib/store.ts";
import { clock } from "../lib/format.ts";

interface Props extends Omit<TimelineRow, "key"> {
  streaming: boolean;
  transitionActivity?: (id: string, update: () => void) => void;
}

export const MessageBlock = memo(function MessageBlock({
  messageId,
  streaming,
  row,
  first,
  last,
  replyIds,
  latestStep,
  transitionActivity,
}: Props) {
  const shell = useApp((state) => messageId ? state.messages[messageId] : undefined);
  const partKind = useApp((state) => row?.kind === "part" ? state.parts.get(row.id)?.kind : undefined);
  const threadId = useApp((state) => state.activeThreadId && state.threads[state.activeThreadId] ? state.activeThreadId : undefined);
  const projectId = useApp((state) => state.threads[threadId ?? ""]?.projectId);
  const timestamp = useApp((state) => {
    const thread = state.threads[threadId ?? ""];
    return shell ? shell.ts : thread?.runStartedAt ?? thread?.updatedAt ?? 0;
  });
  const [fresh] = useState(() => first ? Date.now() - timestamp < 2000 : streaming);

  if (!shell && (messageId !== undefined || !threadId)) return null;

  if (shell?.role === "user") {
    return (
      <article id={`message-${messageId}`} className="turn turn-user" data-fresh={fresh || undefined}>
        <div className="message-content">
          {shell.attachments?.length && threadId && projectId ? (
            <Attachments
              files={shell.attachments}
              projectId={projectId}
              threadId={threadId}
            />
          ) : null}
          <UserBubble partIds={shell.partIds} />
          <div className="turn-meta">
            <time>{clock(shell.ts)}</time>
            {threadId && messageId && <MessageActions threadId={threadId} messageId={messageId} user />}
          </div>
        </div>
      </article>
    );
  }

  const activity = Boolean(row && row.kind !== "part") || Boolean(partKind && partKind !== "text");

  return (
    <article
      id={first && messageId ? `message-${messageId}` : undefined}
      className="turn turn-agent"
      data-fresh={fresh || undefined}
      data-continuation={!first || undefined}
      data-last={last}
      data-activity={activity || undefined}
    >
      <div className="message-content">
        {row && (
          <div className={activity ? "agent-activity" : "message-bubble agent-card"}>
            {row.kind === "fold" ? (
              <WorkDetails id={row.id} ids={row.ids} messageIds={row.messageIds} open={row.open} active={row.active} since={row.since} transitionActivity={transitionActivity} />
            ) : row.kind === "live" ? (
              <Working messageIds={row.messageIds} />
            ) : row.kind === "group" ? (
              <WorkGroup key={row.ids[0]} ids={row.ids} live={streaming} latestStep={latestStep} />
            ) : (
              <PartView key={row.id} partId={row.id} live={streaming} />
            )}
          </div>
        )}
        {last && messageId && !streaming && (
          <div className="turn-meta">
            <time>{clock(timestamp)}</time>
            {threadId && messageId && <MessageActions threadId={threadId} messageId={messageId} replyIds={replyIds} user={false} />}
          </div>
        )}
      </div>
    </article>
  );
});
