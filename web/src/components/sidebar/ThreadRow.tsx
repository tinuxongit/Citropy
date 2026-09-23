import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Clock, GitBranch, GitPullRequest } from "lucide-react";
import type { ThreadMeta } from "../../../../shared/protocol.ts";
import { finishThread, loadThread, removeThread } from "../../lib/actions.ts";
import { modelLabel, threadActivity } from "../../lib/format.ts";
import { currentLocale, useI18n } from "../../lib/i18n.ts";
import { selectProject, selectThread, useApp } from "../../lib/store.ts";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";
import { ConversationMenu } from "../ConversationMenu.tsx";
import { Check, Folder, RotateCcw, Trash2 } from "../icons.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { ThreadChildren } from "../ThreadChildren.tsx";
import { ThreadPulse } from "../ThreadPulse.tsx";
import type { ThreadDrag } from "./use-thread-drag.ts";
import type { ThreadPreviewControls } from "./use-thread-preview.ts";
import type { SearchMatch } from "./use-thread-search.ts";
import type { ThreadTree } from "./use-thread-tree.ts";

const SELECTION_TRANSITION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] } as const;

function pullRequestNumber(url: string): string | undefined {
  return url.split("/").at(-1);
}

export function ThreadRow({ thread, globalMode, query, match, projectName, categoryEnd, drag, preview, tree, onMove, onFinished, onConversation }: {
  thread: ThreadMeta;
  globalMode: boolean;
  query: string;
  match?: SearchMatch;
  projectName?: string;
  categoryEnd: boolean;
  drag: ThreadDrag;
  preview: ThreadPreviewControls;
  tree: ThreadTree;
  onMove: (direction: number) => void;
  onFinished: () => void;
  onConversation: () => void;
}) {
  const t = useI18n();
  const activeThreadId = useApp((state) => state.activeThreadId);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const connected = useApp((state) => state.connected);
  const provider = useApp((state) => state.providers.find((entry) => entry.id === thread.provider));
  const reducedMotion = useReducedMotion();
  const active = thread.id === activeThreadId;
  const { status, label } = threadActivity(thread);
  const searching = Boolean(query.trim());
  const busy = thread.running || thread.status === "awaiting";
  const childRunning = (tree.childrenByParent.get(thread.id) ?? []).some((child) => child.running);
  const finishLabel = `${thread.finished ? t("Reopen") : t("Finish")} ${thread.title}`;

  const open = () => {
    preview.hide();
    onConversation();
    if (thread.projectId !== activeProjectId) selectProject(thread.projectId);
    selectThread(thread.id);
    loadThread(thread.id);
    useApp.setState({ searchMessageId: match?.messageId ?? null });
  };

  return (
    <div
      className="thread-entry"
      data-thread-id={thread.id}
      data-category-end={categoryEnd}
      data-dragging={drag.draggingId === thread.id}
      style={{ "--thread-shift": `${drag.shifts.get(thread.id) ?? 0}px` } as CSSProperties}
      onPointerDown={(event) => drag.start(event, thread)}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={drag.suppressClickAfterDrag}
    >
      <div className="thread-card" data-active={active} onPointerDownCapture={preview.hide}>
        {active && <motion.span
          className="thread-selection"
          aria-hidden="true"
          layoutId="sidebar-thread-selection"
          layoutDependency={activeThreadId}
          transition={reducedMotion ? { duration: 0 } : SELECTION_TRANSITION}
        />}
        <button
          type="button"
          className="thread-row"
          data-active={active}
          aria-label={thread.title}
          aria-description={new Date(thread.updatedAt).toLocaleString(currentLocale())}
          aria-describedby={preview.describedBy(thread.id)}
          aria-current={active ? "page" : undefined}
          onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.show(event.currentTarget, thread.id); }}
          onPointerLeave={preview.leave}
          onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) preview.show(event.currentTarget, thread.id, true); }}
          onBlur={preview.hide}
          onClick={open}
        >
          <span className="thread-row-body">
            <span className="thread-row-heading">
              <ProviderIcon provider={thread.provider} />
              <span className="thread-row-title">{thread.title}</span>
              {status !== "idle" && status !== "stopped" && (
                <span className="thread-status" data-status={status} role="img" aria-label={t(label)}>
                  <ThreadPulse status={status} />
                </span>
              )}
            </span>
            {projectName !== undefined && (
              <span className="thread-row-meta"><Folder size={12} />{projectName}</span>
            )}
            {!globalMode && thread.snoozedUntil && (
              <span className="thread-row-meta">
                <Clock size={12} />
                {t("Until")} {" "}
                {new Date(thread.snoozedUntil).toLocaleString(currentLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {!globalMode && searching && <span className="search-snippet">{match?.snippet}</span>}
          </span>
          {!globalMode && <span className="thread-row-footer">
            <span className="thread-row-summary">
              <span className="thread-provider truncate">{modelLabel(provider?.models ?? [], thread.model)}</span>
              {thread.workspaceBranch && <span className="thread-row-branch"><GitBranch size={11} /><span className="truncate">{thread.workspaceBranch}</span></span>}
            </span>
          </span>}
        </button>
        <div className="thread-row-actions" onPointerEnter={preview.hide}>
          <ConversationMenu thread={thread} onMove={onMove} />
          {globalMode && thread.pullRequest && <a
            className="thread-row-pr"
            href={thread.pullRequest}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${t("Pull request")} #${pullRequestNumber(thread.pullRequest)}`}
            title={`${t("Pull request")} #${pullRequestNumber(thread.pullRequest)}`}
          ><GitPullRequest size={13} /></a>}
          <button
            className="thread-row-finish"
            type="button"
            title={busy ? t("Stop this conversation before finishing") : finishLabel}
            aria-label={finishLabel}
            disabled={!connected || busy || childRunning}
            onClick={() => {
              finishThread(thread.id, !thread.finished);
              if (!thread.finished) onFinished();
            }}
          >
            {thread.finished ? <RotateCcw size={14} /> : <Check size={15} />}
          </button>
          <button
            className="thread-row-kill"
            type="button"
            aria-label={`${t("Delete")} ${thread.title}`}
            title={`${t("Delete")} ${thread.title}`}
            onClick={() => removeThread(thread.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {!globalMode && thread.pullRequest && (
        <a className="thread-pr" href={thread.pullRequest} target="_blank" rel="noreferrer">
          <GitPullRequest size={12} />
          {t("Pull request")} #{pullRequestNumber(thread.pullRequest)}
        </a>
      )}
      {!query && <ThreadChildren parent={thread} {...tree} activeThreadId={activeThreadId} onConversation={onConversation} />}
    </div>
  );
}
