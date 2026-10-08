import { ArchiveIcon, TrashIcon } from "../icons/actions.tsx";
import { ArrowLeftIcon } from "../icons/arrows.tsx";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { StashIcon } from "../StashIcon.tsx";
import { ResizeHandle } from "../ResizeHandle.tsx";
import { GitReview } from "../GitReview.tsx";
import type { GitSelection } from "./selection.ts";
import { EmptyState } from "./GitEmptyState.tsx";
import type { GitDialogAction } from "../GitDialog.tsx";
import type { GitFile, GitOperation, GitOverview } from "../../../../shared/protocol.ts";
import type { ReactNode } from "react";
import { SelectionHighlight } from "../SelectionHighlight.tsx";

export function StashesSection({
  data,
  projectId,
  disabled,
  selection,
  revision,
  files,
  conflicts,
  selectedStash,
  reviewChanges,
  setSelection,
  showDialog,
  act,
  saveStash,
}: {
  data: GitOverview;
  projectId: string;
  disabled: boolean;
  selection: GitSelection | null;
  revision: number;
  files: GitFile[];
  conflicts: GitFile[];
  selectedStash:
    | { ref: string; subject: string }
    | undefined;
  reviewChanges: ReactNode;
  setSelection: (value: GitSelection | null) => void;
  showDialog: (action: GitDialogAction) => void;
  act: (
    operation: GitOperation,
    value?: string,
    page?: number,
    remote?: string,
  ) => Promise<boolean>;
  saveStash: () => void;
}) {
  return (
    <div className="git-stash-layout">
      <header className="git-section-heading">
        <div>
          <p>{" "}Set unfinished work aside and restore it when you're ready.{" "}</p>
        </div>
        {data.hasCommits && data.stashes.length > 0 && (
          <button
            className="btn"
            data-variant="primary"
            disabled={
              disabled || !files.length || conflicts.length > 0
            }
            title={
              !files.length
                ? "Make a change before saving a stash"
                : undefined
            }
            onClick={saveStash}
          >
            <ArchiveIcon size={15} />
            Save changes
          </button>
        )}
      </header>
      {!data.hasCommits ? (
        <EmptyState
            title="Make a first commit to use stashes"
          action={reviewChanges}
        >
          <p>{" "}A stash saves work relative to a commit. Create your first commit before setting changes aside.{" "}</p>
        </EmptyState>
      ) : !data.stashes.length ? (
        <EmptyState
          title="No work set aside"
          action={
            files.length ? (
              <button
                className="btn"
                disabled={disabled || conflicts.length > 0}
                onClick={saveStash}
              >
                Save current changes
              </button>
            ) : undefined
          }
        >
          <p>{" "}Stashes keep unfinished changes while you switch tasks. Applying one restores the files and keeps the saved copy.{" "}</p>
          {!files.length && <p>Your working tree is clean.</p>}
        </EmptyState>
      ) : (
        <div
          className="git-split"
          data-detail={selection?.kind === "stash"}
        >
          <div className="git-stash-list scroll sliding-selection">
            <SelectionHighlight value={selection?.kind === "stash" ? selection.ref : undefined} />
            {data.stashes.map((entry) => (
              <button
                className="git-history-row"
                key={entry.ref}
                aria-pressed={
                  selection?.kind === "stash" &&
                  selection.ref === entry.ref
                }
                onClick={() =>
                  setSelection({ kind: "stash", ref: entry.ref })
                }
              >
                <StashIcon size={16} />
                <span>
                  <strong>{entry.subject}</strong>
                  <small>{entry.ref}</small>
                </span>
                <ChevronRightIcon size={14} />
              </button>
            ))}
          </div>
          <ResizeHandle panel="git" inline />
          <section
            className="git-review-pane"
            aria-label="Stash preview"
          >
            {selection?.kind === "stash" && selectedStash ? (
              <>
                <header className="git-review-header">
                  <button
                    className="icon-btn git-mobile-back"
                    aria-label="Back to stashes"
                    onClick={() => setSelection(null)}
                  >
                    <ArrowLeftIcon size={17} />
                  </button>
                  <div>
                    <h2>{selectedStash.subject}</h2>
                    <p>
                      {selectedStash.ref}{" "}· Applying keeps this saved copy{" "}</p>
                  </div>
                  <div className="git-inline-actions">
                    <button
                      className="icon-btn git-danger"
                      aria-label="Delete stash"
                      disabled={disabled}
                      onClick={() =>
                        showDialog({
                          operation: "dropStash",
                          value: selectedStash.ref,
                          title: "Delete this stash?",
                          description: `${selectedStash.subject} will be permanently removed from your saved stashes.`,
                          label: "Delete stash",
                          danger: true,
                        })
                      }
                    >
                      <TrashIcon size={15} />
                    </button>
                    <button
                      className="btn"
                      data-variant="primary"
                      disabled={disabled || conflicts.length > 0}
                      onClick={() =>
                        void act("applyStash", selectedStash.ref)
                      }
                    >
                      <ArchiveIcon size={14} />
                      Apply stash
                    </button>
                  </div>
                </header>
                <GitReview
                  key={selection.ref}
                  projectId={projectId}
                  selection={selection}
                  revision={revision}
                />
              </>
            ) : (
              <EmptyState title="Review saved work">
                <p>{" "}Select a stash to inspect its file changes before applying it.{" "}</p>
              </EmptyState>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
