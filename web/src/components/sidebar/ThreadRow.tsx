import { memo, type CSSProperties } from "react";
import { PullRequestIcon } from "../icons/git.tsx";
import { CheckIcon } from "../icons/marks.tsx";
import { RotateCcwIcon } from "../icons/rotation.tsx";
import { TrashIcon } from "../icons/actions.tsx";
import type { ThreadMeta } from "../../../../shared/protocol.ts";
import { finishThread, loadThread, openOnEnvironment, removeThread } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import { opensContextMenu } from "../../lib/context-menu-key.ts";
import { dateTime, since, threadActivity } from "../../lib/format.ts";
import { environmentId, useEnvironments } from "../../lib/environment.ts";
import { environmentSlice } from "../../lib/live-environments.ts";
import { selectProject, selectThread, useApp } from "../../lib/store.ts";
import { useTouchInput } from "../../lib/use-touch-input.ts";
import { ConversationMenu } from "../ConversationMenu.tsx";
import type { MenuItem } from "../Menu.tsx";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { ThreadChildren } from "../ThreadChildren.tsx";
import { ThreadPulse } from "../ThreadPulse.tsx";
import type { ThreadDrag } from "./use-thread-drag.ts";
import type { ThreadPreviewControls } from "./use-thread-preview.ts";
import type { SearchMatch } from "./use-thread-search.ts";
import { finishBlocked, type ThreadTree } from "./use-thread-tree.ts";
import { threadKey } from "./thread-groups.ts";

function pullRequestNumber(url: string): string | undefined {
  return url.split("/").at(-1);
}

export const ThreadRow = memo(function ThreadRow({ thread, environment, now, query, match, picked, drag, preview, describedBy, tree, onFinished, onConversation }: {
  thread: ThreadMeta;
  environment: string;
  now: number;
  query: string;
  match?: SearchMatch;
  picked: boolean;
  drag: ThreadDrag;
  preview: ThreadPreviewControls;
  describedBy?: string;
  tree: ThreadTree;
  onFinished: () => void;
  onConversation: () => void;
}) {
  const selected = useApp((state) => state.activeThreadId === thread.id);
  const activeChildId = useApp((state) => tree.childrenByParent.has(thread.id) ? state.activeThreadId : null);
  const slice = environmentSlice(environment);
  const connected = slice?.connected ?? false;
  const current = useEnvironments().activeId === environment;
  const active = current && selected;
  const key = threadKey(environment, thread.id);
  const { status, label } = threadActivity(thread);
  const busy = thread.running || thread.status === "awaiting";
  const blocked = finishBlocked(thread, tree);
  const finishLabel = `${thread.finished ? "Reopen" : "Finish"} ${thread.title}`;
  const touch = useTouchInput();
  const finish = () => {
    finishThread(thread.id, !thread.finished, environment);
    if (!thread.finished) onFinished();
  };
  const remove = () => void removeThread(thread.id, environment).catch(reportError);
  const rowActions: MenuItem[] = touch ? [
    { id: "finish", label: thread.finished ? "Reopen" : "Finish", icon: thread.finished ? <RotateCcwIcon size={15} /> : <CheckIcon size={15} />, disabled: !connected || blocked, onSelect: finish },
    { id: "delete", label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: remove },
  ] : [];

  const openMenu = (card: HTMLElement) => {
    preview.hide();
    const button = card.querySelector<HTMLButtonElement>(".thread-more");
    if (button?.getAttribute("aria-expanded") !== "true") button?.click();
  };

  const open = () => {
    preview.hide();
    onConversation();
    if (environment !== environmentId()) {
      void openOnEnvironment(environment, thread.projectId, thread.id).then(() => {
        useApp.setState({ searchMessageId: match?.messageId ?? null });
      }).catch(reportError);
      return;
    }
    if (thread.projectId !== useApp.getState().activeProjectId) selectProject(thread.projectId);
    selectThread(thread.id);
    loadThread(thread.id);
    useApp.setState({ searchMessageId: match?.messageId ?? null });
  };

  return (
    <div
      className="thread-entry"
      data-thread-id={thread.id}
      data-environment={environment}
      data-dragging={drag.draggingId === key}
      style={{ "--thread-shift": `${drag.shifts.get(key) ?? 0}px` } as CSSProperties}
      onPointerDown={(event) => drag.start(event, { thread, environment })}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={drag.suppressClickAfterDrag}
    >
      <div
        className="thread-card"
        data-active={active}
        data-picked={picked}
        onPointerDownCapture={preview.hide}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('[role="menu"], dialog, a')) return;
          event.preventDefault();
          event.stopPropagation();
          openMenu(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (!opensContextMenu(event)) return;
          if ((event.target as HTMLElement).closest('[role="menu"], dialog, a')) return;
          event.preventDefault();
          event.stopPropagation();
          openMenu(event.currentTarget);
        }}
      >
        <button
          type="button"
          className="thread-row"
          data-active={active}
          aria-label={thread.title}
          aria-description={dateTime(thread.updatedAt)}
          aria-describedby={describedBy}
          aria-current={active ? "page" : undefined}
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            preview.show(event.currentTarget, environment, thread.id);
          }}
          onPointerLeave={preview.leave}
          onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) preview.show(event.currentTarget, environment, thread.id, true); }}
          onBlur={preview.hide}
          onClick={open}
        >
          <ProviderIcon provider={thread.provider} />
          <span className="thread-row-title">{thread.title}</span>
          {status !== "idle" && status !== "stopped" ? (
            <span className="thread-status" data-status={status} role="img" aria-label={label}>
              <ThreadPulse status={status} />
            </span>
          ) : <time className="thread-row-time" dateTime={new Date(thread.updatedAt).toISOString()}>{since(thread.updatedAt, now)}</time>}
        </button>
        <div className="thread-row-actions" onPointerEnter={preview.hide}>
          <ConversationMenu thread={thread} environment={environment} rowActions={rowActions} />
          {thread.pullRequest && <a
            className="thread-row-pr"
            href={thread.pullRequest}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Pull request #${pullRequestNumber(thread.pullRequest)}`}
            title={`Pull request #${pullRequestNumber(thread.pullRequest)}`}
          ><PullRequestIcon size={13} /></a>}
          {!touch && <>
            <button
              className="thread-row-finish"
              type="button"
              title={busy ? "Stop this conversation before finishing" : finishLabel}
              aria-label={finishLabel}
              disabled={!connected || blocked}
              onClick={finish}
            >
              {thread.finished ? <RotateCcwIcon size={14} /> : <CheckIcon size={15} />}
            </button>
            <button
              className="thread-row-kill"
              type="button"
              aria-label={`Delete ${thread.title}`}
              title={`Delete ${thread.title}`}
              onClick={remove}
            >
              <TrashIcon size={13} />
            </button>
          </>}
        </div>
      </div>
      {!query && <ThreadChildren parent={thread} environment={environment} {...tree} activeThreadId={current ? activeChildId : null} onConversation={onConversation} />}
    </div>
  );
});
