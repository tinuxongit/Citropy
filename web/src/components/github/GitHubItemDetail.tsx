import type { KeyboardEvent } from "react";
import { GitBranch } from "lucide-react";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { useI18n } from "../../lib/i18n.ts";
import { FileIcon } from "../FileIcon.tsx";
import { Prose } from "../parts/Prose.tsx";
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
  if (
    current < 0 ||
    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
  )
    return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) %
          buttons.length;
  buttons[next]?.click();
  buttons[next]?.focus();
}

function patchLineKind(line: string) {
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  if (line.startsWith("@@")) return "hunk";
  return "context";
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
  const t = useI18n();
  const { item } = detail;
  const canManage = Boolean(repository.permissions?.push);
  const canEdit = canManage || item.user?.login === currentUser;
  return (
    <>
      <header className="github-item-heading">
        <GitHubState state={githubItemState(item)} pull={pull} />
        <span className="github-meta">#{item.number}</span>
        <GitHubLink href={item.html_url}>{t("Open on GitHub")}</GitHubLink>
        <h2>{item.title}</h2>
        <p>
          {item.user?.login ?? t("Deleted user")} {t("opened this")} {" "}
          {githubDate(item.created_at)}
        </p>
      </header>
      {pull && item.head && (
        <div className="github-branch-line">
          <GitBranch size={15} />
          <code>{item.head.label}</code>
          <span>{t("into")}</span>
          <code>{item.base?.ref}</code>
        </div>
      )}
      <div className="github-detail-actions">
        <button className="btn" onClick={() => onAction("comment")}>
          {t("Comment")}
        </button>
        <button
          className="btn"
          onClick={() => onAction("edit")}
          disabled={repository.archived || !canEdit}
        >
          {t("Edit")}
        </button>
        {pull && item.state === "open" && (
          <>
            <button
              className="btn"
              onClick={() => onAction("review")}
              disabled={item.user?.login === currentUser}
            >
              {t("Review")}
            </button>
            {canEdit && (
              <button className="btn" onClick={() => onAction("reviewers")}>
                {t("Request review")}
              </button>
            )}
            {canEdit && item.draft && (
              <button className="btn" onClick={() => onAction("ready")}>
                {t("Ready for review")}
              </button>
            )}
            {canManage && !item.draft && (
              <button
                className="btn"
                data-variant="primary"
                disabled={item.mergeable === false}
                onClick={() => onAction("merge")}
              >
                {t("Merge…")}
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
            {item.state === "open" ? t("Close") : t("Reopen")}
          </button>
        )}
      </div>
      {pull && item.mergeable === false && (
        <p className="github-notice">
          {t("This pull request has conflicts. Resolve them before merging.")}
        </p>
      )}
      <div
        className="github-tabs sliding-selection"
        role="tablist"
        aria-label={pull ? t("Pull request details") : t("Issue details")}
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
  const t = useI18n();
  const { item } = detail;
  return (
    <div className="github-discussion">
      <Prose text={item.body || t("No description provided.")} live={false} />
      {(item.labels.length > 0 || item.assignees.length > 0) && (
        <div className="github-item-metadata">
          <span>{" "}{t("Labels:")}{" "}
            {item.labels.map((label) => label.name).join(", ") || t("None")}
          </span>
          <span>{" "}{t("Assignees:")}{" "}
            {item.assignees.map((user) => user.login).join(", ") || t("None")}
          </span>
        </div>
      )}
      {detail.reviews.map((review) => (
        <article className="github-comment" key={`review-${review.id}`}>
          <header>
            <strong>{review.user?.login ?? t("Deleted user")}</strong>
            <GitHubState state={review.state ?? "commented"} />
            <GitHubLink className="github-meta" href={review.html_url}>{" "}{t("Review")}{" "}</GitHubLink>
          </header>
          <Prose text={review.body} live={false} />
        </article>
      ))}
      {detail.comments.map((comment) => (
        <article className="github-comment" key={comment.id}>
          <header>
            <strong>{comment.user?.login ?? t("Deleted user")}</strong>
            <span>{githubDate(comment.created_at!)}</span>
            <GitHubLink className="github-meta" href={comment.html_url}>{" "}{t("Comment")}{" "}</GitHubLink>
          </header>
          <Prose text={comment.body} live={false} />
        </article>
      ))}
    </div>
  );
}

function FilesChanged({ files }: { files: GitHubFile[] }) {
  const t = useI18n();
  return (
    <div className="github-files">
      {files.map((file) => (
        <details key={file.filename} open>
          <summary>
            <FileIcon path={file.filename} />
            <span>{file.filename}</span>
            <span className="add">+{file.additions}</span>
            <span className="del">−{file.deletions}</span>
          </summary>
          {file.previous_filename && (
            <p className="github-meta">{" "}{t("Renamed from")}{" "}{file.previous_filename}
            </p>
          )}
          {file.patch ? (
            <pre className="github-patch">
              {file.patch.split("\n").map((line, index) => (
                <span key={index} data-kind={patchLineKind(line)}>
                  {line}
                </span>
              ))}
            </pre>
          ) : (
            <p className="github-meta">{" "}{t("GitHub does not provide an inline diff for this file.")}{" "}
              <GitHubLink className="github-inline-link" href={file.blob_url}>{" "}{t("View file")}{" "}</GitHubLink>
            </p>
          )}
        </details>
      ))}
    </div>
  );
}

function Checks({ detail }: { detail: GitHubDetail }) {
  const t = useI18n();
  return (
    <div className="github-checks">
      {detail.checks.map((check) => (
        <div key={check.id}>
          <GitHubState state={check.conclusion ?? check.status} />
          <strong>{check.name}</strong>
          <GitHubLink href={check.details_url}>{" "}{t("Details")}{" "}</GitHubLink>
        </div>
      ))}
      {detail.statuses.map((check) => (
        <div key={check.id}>
          <GitHubState state={check.state} />
          <strong>{check.context}</strong>
          <GitHubLink href={check.target_url}>{" "}{t("Details")}{" "}</GitHubLink>
        </div>
      ))}
      {!detail.checks.length && !detail.statuses.length && (
        <p className="github-meta">{" "}{t("No checks reported for this commit.")}{" "}</p>
      )}
    </div>
  );
}
