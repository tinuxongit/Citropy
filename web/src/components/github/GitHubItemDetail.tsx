import { useMemo, useState, type KeyboardEvent } from "react";
import { BranchIcon } from "../icons/git.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { FileIcon } from "../FileIcon.tsx";
import { Prose } from "../parts/Prose.tsx";
import { DiffView } from "../DiffView.tsx";
import { VirtualList } from "../VirtualList.tsx";
import { nextTabIndex } from "../../lib/tab-strip.ts";
import { parseUnifiedDiff } from "../../../../shared/diff.ts";
import { GitHubLink, GitHubState, githubDate } from "./GitHubShared.tsx";
import type { ItemAction } from "./GitHubItemDialog.tsx";
import type {
  GitHubDetail,
  GitHubFile,
  GitHubItem,
  GitHubRepository,
} from "../../../../shared/github.ts";

export function githubItemState(entry: GitHubItem): string {
  return entry.merged || entry.merged_at || entry.pull_request?.merged_at
    ? "merged"
    : entry.draft
      ? "draft"
      : entry.state;
}

function moveTabFocus(event: KeyboardEvent<HTMLDivElement>) {
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  );
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0) return;
  const next = nextTabIndex(event.key, current, buttons.length);
  if (next === undefined) return;
  event.preventDefault();
  buttons[next]?.click();
  buttons[next]?.focus();
}

export function GitHubItemDetail({
  repository,
  pull,
  currentUser,
  detail,
  tab,
  onTab,
  onAction,
}: {
  repository: GitHubRepository;
  pull: boolean;
  currentUser: string;
  detail: GitHubDetail;
  tab: string;
  onTab: (tab: string) => void;
  onAction: (action: ItemAction) => void;
}) {
  const { item } = detail;
  const canManage = Boolean(repository.permissions?.push);
  const canEdit = canManage || item.user?.login === currentUser;
  return (
    <>
      <header className="github-item-heading">
        <GitHubState state={githubItemState(item)} pull={pull} />
        <span className="github-meta">#{item.number}</span>
        <GitHubLink href={item.html_url}>Open on GitHub</GitHubLink>
        <h2>{item.title}</h2>
        <p>
          {item.user?.login ?? "Deleted user"} opened this {" "}
          {githubDate(item.created_at)}
        </p>
      </header>
      {pull && item.head && (
        <div className="github-branch-line">
          <BranchIcon size={15} />
          <code>{item.head.label}</code>
          <span>into</span>
          <code>{item.base?.ref}</code>
        </div>
      )}
      <div className="github-detail-actions">
        <button className="btn" onClick={() => onAction("comment")}>
          Comment
        </button>
        <button
          className="btn"
          onClick={() => onAction("edit")}
          disabled={repository.archived || !canEdit}
        >
          Edit
        </button>
        {pull && item.state === "open" && (
          <>
            <button
              className="btn"
              onClick={() => onAction("review")}
              disabled={item.user?.login === currentUser}
            >
              Review
            </button>
            {canEdit && (
              <button className="btn" onClick={() => onAction("reviewers")}>
                Request review
              </button>
            )}
            {canEdit && item.draft && (
              <button className="btn" onClick={() => onAction("ready")}>
                Ready for review
              </button>
            )}
            {canManage && !item.draft && (
              <button
                className="btn"
                data-variant="primary"
                disabled={item.mergeable === false}
                onClick={() => onAction("merge")}
              >
                Merge…
              </button>
            )}
          </>
        )}
        {canEdit && !item.merged && !repository.archived && (
          <button
            className="btn"
            data-variant="ghost"
            onClick={() => onAction("state")}
          >
            {item.state === "open" ? "Close" : "Reopen"}
          </button>
        )}
      </div>
      {pull && item.mergeable === false && (
        <p className="github-notice">
          This pull request has conflicts. Resolve them before merging.
        </p>
      )}
      <div
        className="github-tabs sliding-selection"
        role="tablist"
        aria-label={pull ? "Pull request details" : "Issue details"}
        onKeyDown={moveTabFocus}
      >
        <SelectionHighlight value={tab} />
        {(pull
          ? ["Conversation", "Files changed", "Checks"]
          : ["Conversation"]
        ).map((name) => (
          <button
            role="tab"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            key={name}
            onClick={() => onTab(name)}
          >
            {name}
            {name === "Files changed" && <span>{item.changed_files}</span>}
            {name === "Checks" && (
              <span>{detail.checks.length + detail.statuses.length}</span>
            )}
          </button>
        ))}
      </div>
      {tab === "Conversation" && <Conversation detail={detail} />}
      {tab === "Files changed" && <FilesChanged files={detail.files} />}
      {tab === "Checks" && <Checks detail={detail} />}
    </>
  );
}

function Conversation({ detail }: { detail: GitHubDetail }) {
  const { item } = detail;
  return (
    <div className="github-discussion">
      <Prose text={item.body || "No description provided."} live={false} />
      {(item.labels.length > 0 || item.assignees.length > 0) && (
        <div className="github-item-metadata">
          <span>{" "}Labels:{" "}
            {item.labels.map((label) => label.name).join(", ") || "None"}
          </span>
          <span>{" "}Assignees:{" "}
            {item.assignees.map((user) => user.login).join(", ") || "None"}
          </span>
        </div>
      )}
      {detail.reviews.map((review) => (
        <article className="github-comment" key={`review-${review.id}`}>
          <header>
            <strong>{review.user?.login ?? "Deleted user"}</strong>
            <GitHubState state={review.state ?? "commented"} />
            <GitHubLink className="github-meta" href={review.html_url}>{" "}Review{" "}</GitHubLink>
          </header>
          <Prose text={review.body} live={false} />
        </article>
      ))}
      {detail.comments.map((comment) => (
        <article className="github-comment" key={comment.id}>
          <header>
            <strong>{comment.user?.login ?? "Deleted user"}</strong>
            <span>{githubDate(comment.created_at!)}</span>
            <GitHubLink className="github-meta" href={comment.html_url}>{" "}Comment{" "}</GitHubLink>
          </header>
          <Prose text={comment.body} live={false} />
        </article>
      ))}
    </div>
  );
}

function FilesChanged({ files }: { files: GitHubFile[] }) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  return (
    <VirtualList items={files} itemKey="filename" estimateSize={300} className="github-files">
      {file => (
        <details open={!collapsed.has(file.filename)} onToggle={event => {
          const open = event.currentTarget.open;
          setCollapsed(previous => {
            if (previous.has(file.filename) === !open) return previous;
            const next = new Set(previous);
            if (open) next.delete(file.filename); else next.add(file.filename);
            return next;
          });
        }}>
          <summary>
            <FileIcon path={file.filename} />
            <span>{file.filename}</span>
            <span className="add">+{file.additions}</span>
            <span className="del">−{file.deletions}</span>
          </summary>
          {file.previous_filename && (
            <p className="github-meta">{" "}Renamed from{" "}{file.previous_filename}
            </p>
          )}
          {!collapsed.has(file.filename) && (file.patch ? (
            <GitHubFileDiff file={file} />
          ) : (
            <p className="github-meta">{" "}GitHub does not provide an inline diff for this file.{" "}
              <GitHubLink className="github-inline-link" href={file.blob_url}>{" "}View file{" "}</GitHubLink>
            </p>
          ))}
        </details>
      )}
    </VirtualList>
  );
}

function GitHubFileDiff({ file }: { file: GitHubFile }) {
  const patch = useMemo(() => {
    const parsed = parseUnifiedDiff(file.patch ?? "", file.filename, undefined, Infinity)[0];
    return {
      path: file.filename,
      added: file.additions,
      removed: file.deletions,
      hunks: parsed?.hunks ?? [],
      truncated: parsed?.truncated || (parsed?.added ?? 0) < file.additions || (parsed?.removed ?? 0) < file.deletions,
    };
  }, [file]);
  return <DiffView patch={patch} showHeader={false} showHunkHeaders expanded />;
}

function Checks({ detail }: { detail: GitHubDetail }) {
  return (
    <div className="github-checks">
      {detail.checks.map((check) => (
        <div key={check.id}>
          <GitHubState state={check.conclusion ?? check.status} />
          <strong>{check.name}</strong>
          <GitHubLink href={check.details_url}>{" "}Details{" "}</GitHubLink>
        </div>
      ))}
      {detail.statuses.map((check) => (
        <div key={check.id}>
          <GitHubState state={check.state} />
          <strong>{check.context}</strong>
          <GitHubLink href={check.target_url}>{" "}Details{" "}</GitHubLink>
        </div>
      ))}
      {!detail.checks.length && !detail.statuses.length && (
        <p className="github-meta">{" "}No checks reported for this commit.{" "}</p>
      )}
    </div>
  );
}
