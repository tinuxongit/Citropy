import {
  ArrowLeft,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ResizeHandle } from "../ResizeHandle.tsx";
import { GitReview, type GitSelection } from "../GitReview.tsx";
import { EmptyState } from "./GitEmptyState.tsx";
import { FileGroup } from "./FileGroup.tsx";
import { fileLabel } from "./files.ts";
import type { GitDialogAction } from "../GitDialog.tsx";
import type {
  GitFile,
  GitOperation,
  GitOverview,
} from "../../../../shared/protocol.ts";
import { PixelLoader } from "../PixelLoader.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";

export function ChangesSection({
  data,
  projectId,
  busy,
  disabled,
  selection,
  revision,
  filter,
  message,
  description,
  files,
  conflicts,
  staged,
  unstaged,
  selectedFile,
  branch,
  canCommit,
  match,
  setFilter,
  setSelection,
  setMessage,
  setDescription,
  showDialog,
  act,
}: {
  data: GitOverview;
  projectId: string;
  busy: GitOperation | null;
  disabled: boolean;
  selection: GitSelection | null;
  revision: number;
  filter: string;
  message: string;
  description: string;
  files: GitFile[];
  conflicts: GitFile[];
  staged: GitFile[];
  unstaged: GitFile[];
  selectedFile: GitFile | undefined;
  branch: string;
  canCommit: boolean;
  match: (text: string) => boolean;
  setFilter: (value: string) => void;
  setSelection: (value: GitSelection | null) => void;
  setMessage: (value: string) => void;
  setDescription: (value: string) => void;
  showDialog: (action: GitDialogAction) => void;
  act: (
    operation: GitOperation,
    value?: string,
    page?: number,
    remote?: string,
  ) => Promise<boolean>;
}) {
  return (
    <div className="git-changes-layout">
      {(data.mergeInProgress || conflicts.length > 0) && (
        <div className="git-merge-banner">
          <GitMerge size={19} />
          <div>
            <strong>
              {conflicts.length
                ? (conflicts.length === 1 ? `${conflicts.length} file needs conflict resolution` : `${conflicts.length} files need conflict resolution`)
                : "Ready to finish the merge"}
            </strong>
            <p>
              {conflicts.length
                ? "Resolve conflict markers in your files, then stage the resolved changes."
                : "Create a commit to complete this merge."}
            </p>
          </div>
          {data.mergeInProgress && (
            <button
              className="btn"
              disabled={disabled}
              onClick={() =>
                showDialog({
                  operation: "abortMerge",
                  title: "Abort this merge?",
                  description:
                    "Return to the state before the merge began. Changes made during the merge may be lost.",
                  label: "Abort merge",
                  danger: true,
                })
              }
            >
              Abort merge
            </button>
          )}
        </div>
      )}
      {!data.hasCommits && (
        <div className="git-first-commit">
          <GitCommitHorizontal size={18} />
          <span>
            <strong>Make your first commit.</strong> Review your files, stage the ones to track, then write a commit message.
          </span>
        </div>
      )}
      <div
        className="git-split"
        data-detail={selection?.kind === "file"}
      >
        <div className="git-change-list">
          <label className="git-filter">
            <Search size={15} />
            <input
              aria-label="Filter changed files"
              placeholder="Filter files…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            {filter && (
              <button
                className="icon-btn"
                aria-label="Clear file filter"
                onClick={() => setFilter("")}
              >
                <X size={13} />
              </button>
            )}
          </label>
          <div className="git-file-groups scroll sliding-selection">
            <SelectionHighlight value={selection?.kind === "file" ? `${selection.staged}:${selection.path}` : undefined} selector='.git-file-row[data-selected="true"]' />
            <FileGroup title="Unstaged changes" list={unstaged} inIndex={false} disabled={disabled} selection={selection} match={match} act={act} setSelection={setSelection} />
            <FileGroup title="Staged for commit" list={staged} inIndex={true} disabled={disabled} selection={selection} match={match} act={act} setSelection={setSelection} />
            {filter && !files.some((file) => match(file.path)) && (
              <p className="git-list-hint">
                No files match '{filter}'.
              </p>
            )}
          </div>
          <form
            className="git-commit-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (canCommit)
                void act("commit", [message.trim(), description.trim()].filter(Boolean).join("\n\n"));
            }}
          >
            <label htmlFor="git-commit-message">
              Commit title
            </label>
            <input
              id="git-commit-message"
              value={message}
              disabled={busy === "commit"}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                data.hasCommits
                  ? "Summarize the change"
                  : "Initial commit"
              }
            />
            <label htmlFor="git-commit-description">
              Description <span className="git-optional">Optional</span>
            </label>
            <textarea
              id="git-commit-description"
              rows={3}
              value={description}
              disabled={busy === "commit"}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explain why this change was made and any useful details."
            />
            <div className="git-commit-target">
              <GitBranch size={13} />
              <span className="truncate">{branch}</span>
              <span>{staged.length} staged</span>
            </div>
            <button
              className="btn"
              data-variant="primary"
              disabled={!canCommit}
            >
              {busy === "commit" ? (
                <PixelLoader size={15} />
              ) : (
                <GitCommitHorizontal size={17} />
              )}
              {data.mergeInProgress
                ? "Complete merge"
                : data.hasCommits
                  ? "Commit staged changes"
                  : "Create first commit"}
            </button>
          </form>
        </div>
        <ResizeHandle panel="git" inline />
        <section
          className="git-review-pane"
          aria-label="File preview"
        >
          {selection?.kind === "file" && selectedFile ? (
            <>
              <header className="git-review-header">
                <button
                  className="icon-btn git-mobile-back"
                  aria-label="Back to changed files"
                  onClick={() => setSelection(null)}
                >
                  <ArrowLeft size={17} />
                </button>
                <div>
                  <h2>{selection.path}</h2>
                  <p>
                    {selection.staged
                      ? "Staged for commit"
                      : `${fileLabel(selectedFile, false)} · Unstaged changes`}
                  </p>
                </div>
                <div className="git-inline-actions">
                  {!selection.staged && (
                    <button
                      className="icon-btn git-danger"
                      title={"Discard changes in " + selection.path}
                      disabled={disabled}
                      onClick={() =>
                        showDialog({
                          operation: "discardWorktree",
                          value: selection.path,
                          title: selectedFile.untracked
                            ? "Delete this new file?"
                            : "Discard unstaged changes?",
                          description: selectedFile.untracked
                            ? `${selection.path} will be permanently deleted.`
                            : `Unstaged edits to ${selection.path} will be lost. Staged changes will be kept.`,
                          label: selectedFile.untracked
                            ? "Delete file"
                            : "Discard changes",
                          danger: true,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  <button
                    className="btn"
                    disabled={disabled}
                    onClick={() =>
                      void act(
                        selection.staged ? "unstage" : "stage",
                        selection.path,
                      )
                    }
                  >
                    {selection.staged ? (
                      <Minus size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                    {selection.staged ? "Unstage" : "Stage file"}
                  </button>
                </div>
              </header>
              <GitReview
                key={`${selection.staged}:${selection.path}`}
                projectId={projectId}
                selection={selection}
                revision={revision}
              />
            </>
          ) : (
            <EmptyState
              title={
                files.length
                  ? "Select a file to review"
                  : data.hasCommits
                    ? "Working tree is clean"
                    : "Add files to get started"
              }
            >
              <p>
                {files.length
                  ? "Choose a file on the left to see exactly what will change."
                  : data.hasCommits
                    ? "Your files match the latest commit. New edits will appear here."
                    : "Create or copy files into this workspace. They'll appear here, ready for your first commit."}
              </p>
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
