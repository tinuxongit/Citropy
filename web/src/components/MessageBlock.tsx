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
import { clock, day } from "../lib/format.ts";
import type { MessageOrigin } from "../../../shared/bots.ts";

function originLabel(origin: MessageOrigin): string {
  return origin.kind === "bot" ? `From ${origin.name}` : `Routine: ${origin.name}`;
}

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
  step,
  stamp,
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
  const eventText = useApp((state) => shell?.role === "system" ? shell.partIds.map((id) => {
    const part = state.parts.get(id);
    return part?.kind === "notice" || part?.kind === "text" ? part.text : "";
  }).join(" ") : undefined);
  const [fresh] = useState(() => first ? Date.now() - timestamp < 2000 : streaming);

  if (!shell && (messageId !== undefined || !threadId)) return null;

  const stampLine = stamp !== undefined && <time className="turn-stamp" dateTime={new Date(stamp).toISOString()}>{day(stamp)} {clock(stamp)}</time>;

  if (eventText !== undefined) {
    return <>{stampLine}<p id={`message-${messageId}`} className="turn-event">{eventText}</p></>;
  }

  if (shell?.role === "user") {
    return (
      <>{stampLine}<article id={`message-${messageId}`} className="turn turn-user" data-fresh={fresh || undefined}>
        <div className="message-content">
          {shell.origin && <span className="turn-origin">{originLabel(shell.origin)}</span>}
          {shell.attachments?.length && threadId && projectId ? (
            <Attachments
              files={shell.attachments}
              projectId={projectId}
              threadId={threadId}
            />
          ) : null}
          <UserBubble partIds={shell.partIds} mentions={shell.mentions} />
          <div className="turn-meta">
            <time>{clock(shell.ts)}</time>
            {threadId && messageId && <MessageActions threadId={threadId} messageId={messageId} user />}
          </div>
        </div>
      </article></>
    );
  }

  const activity = Boolean(row && row.kind !== "part") || Boolean(partKind && partKind !== "text");

  return (
    <>{stampLine}<article
      id={first && messageId ? `message-${messageId}` : undefined}
      className="turn turn-agent"
      data-fresh={fresh || undefined}
      data-continuation={!first || undefined}
      data-last={last}
      data-activity={activity || undefined}
      data-step={step || undefined}
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
    </article></>
  );
});
