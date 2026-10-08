import { ArrowRightIcon } from "../icons/arrows.tsx";
import { CheckIcon, MoreIcon, PlusIcon } from "../icons/marks.tsx";
import { BranchIcon, MergeIcon } from "../icons/git.tsx";
import { SearchIcon, TrashIcon } from "../icons/actions.tsx";
import { Menu } from "../Menu.tsx";
import { RemoteIcon } from "../RemoteIcon.tsx";
import { EmptyState } from "./GitEmptyState.tsx";
import { dateTime, formatDate } from "../../lib/format.ts";
import type { Section } from "./labels.ts";
import type { GitDialogAction } from "../GitDialog.tsx";
import type { GitOperation, GitOverview } from "../../../../shared/protocol.ts";
import type { ReactNode } from "react";

export function BranchesSection({
  data,
  disabled,
  filter,
  branch,
  localBranches,
  remoteBranches,
  reviewChanges,
  setFilter,
  changeSection,
  createBranch,
  match,
  showDialog,
  act,
}: {
  data: GitOverview;
  disabled: boolean;
  filter: string;
  branch: string;
  localBranches: Array<{
    name: string;
    current: boolean;
    remote: boolean;
    upstream: string;
    subject: string;
    date: string;
  }>;
  remoteBranches: Array<{
    name: string;
    current: boolean;
    remote: boolean;
    upstream: string;
    subject: string;
    date: string;
  }>;
  reviewChanges: ReactNode;
  setFilter: (value: string) => void;
  changeSection: (next: Section) => void;
  createBranch: () => void;
  match: (text: string) => boolean;
  showDialog: (action: GitDialogAction) => void;
  act: (
    operation: GitOperation,
    value?: string,
    page?: number,
    remote?: string,
  ) => Promise<boolean>;
}) {
  return (
    <div className="git-page scroll">
      <header className="git-section-heading">
        <div>
          <p>
            Keep separate lines of work and bring changes together.
          </p>
        </div>
        {data.hasCommits && (
          <button
            className="btn"
            data-variant="primary"
            disabled={disabled}
            onClick={createBranch}
          >
            <PlusIcon size={15} />
            New branch
          </button>
        )}
      </header>
      {!data.hasCommits && (
        <div className="git-current-summary">
          <BranchIcon size={22} />
          <div>
            <small>Current branch</small>
            <strong>{branch}</strong>
          </div>
          <span className="git-tag">Awaiting first commit</span>
        </div>
      )}
      {!data.hasCommits ? (
        <EmptyState
          title="Create a commit before branching"
          action={reviewChanges}
        >
          <p>{" "}Your repository is initialized, but{" "}
            <strong>{branch}</strong>{" "}has no commits yet. Save your first commit to create this branch and start new ones from it.{" "}</p>
        </EmptyState>
      ) : (
        <>
          <label className="git-filter git-branch-filter">
            <SearchIcon size={15} />
            <input
              aria-label="Filter branches"
              placeholder="Find a branch…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <div className="git-table-heading">
            <h3>
              Local branches
              <span className="git-count">
                {localBranches.length}
              </span>
            </h3>
            <span>On this computer</span>
          </div>
          <div className="git-card-list">
            {localBranches
              .filter((entry) => match(entry.name))
              .sort((a, b) => Number(b.current) - Number(a.current))
              .map((entry) => (
                <div className="git-branch-row" key={entry.name}>
                  <span className="git-row-mark" data-current={entry.current}>
                    <BranchIcon size={16} />
                  </span>
                  <div className="git-row-main">
                    <div>
                      <strong>{entry.name}</strong>
                      {entry.current && (
                        <span className="git-tag">
                          <CheckIcon size={11} />
                          Current
                        </span>
                      )}
                    </div>
                    <p className="truncate">{entry.subject}</p>
                    <small>
                      {entry.upstream
                        ? "Tracking " + entry.upstream
                        : "Local only"}
                    </small>
                  </div>
                  <time
                    className="git-row-date"
                    title={dateTime(entry.date)}
                  >
                    {formatDate(entry.date, { month: "short", day: "numeric" })}
                  </time>
                  {!entry.current && (
                    <div className="git-inline-actions">
                      <button
                        className="btn"
                        disabled={disabled || data.mergeInProgress}
                        onClick={() =>
                          void act("switchBranch", entry.name)
                        }
                      >
                        Switch
                        <ArrowRightIcon size={13} />
                      </button>
                      <Menu
                        align="end"
                        width={245}
                        trigger={({ toggle, id, open }) => (
                          <button
                            id={id}
                            className="icon-btn"
                            aria-label={`Actions for ${entry.name}`}
                            aria-expanded={open}
                            aria-haspopup="menu"
                            disabled={
                              disabled || data.mergeInProgress
                            }
                            onClick={toggle}
                          >
                            <MoreIcon size={17} />
                          </button>
                        )}
                        items={[
                          {
                            id: "merge",
                            label: `Merge into ${branch}`,
                            icon: <MergeIcon size={14} />,
                            onSelect: () =>
                              showDialog({
                                operation: "merge",
                                value: entry.name,
                                title: `Merge into ${branch}?`,
                                description: `Bring commits from ${entry.name} into your current branch, ${branch}.`,
                                label: "Merge branch",
                              }),
                          },
                          {
                            id: "delete",
                            label: "Delete branch",
                            icon: <TrashIcon size={14} />,
                            danger: true,
                            onSelect: () =>
                              showDialog({
                                operation: "deleteBranch",
                                value: entry.name,
                                title: `Delete ${entry.name}?`,
                                description:
                                  "Delete this local branch. Git will keep it if it contains unmerged work.",
                                label: "Delete branch",
                                danger: true,
                              }),
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>
              ))}
          </div>
          {filter &&
            !localBranches.some((entry) => match(entry.name)) && (
              <p className="git-list-hint">
                No local branches match your search.
              </p>
            )}
          <div className="git-table-heading">
            <h3>
              Remote branches
              <span className="git-count">
                {remoteBranches.length}
              </span>
            </h3>
            <button
              className="git-text-button"
              onClick={() => changeSection("Remotes")}
            >
                Manage remotes
              <ArrowRightIcon size={13} />
            </button>
          </div>
          {remoteBranches.length ? (
            <div className="git-card-list">
            {remoteBranches
              .filter((entry) => match(entry.name))
              .map((entry) => (
                <div className="git-branch-row" key={entry.name}>
                  <span className="git-row-mark">
                    <RemoteIcon size={16} />
                  </span>
                  <div className="git-row-main">
                    <strong>{entry.name}</strong>
                    <p className="truncate">{entry.subject}</p>
                  </div>
                  <time className="git-row-date">
                    {formatDate(entry.date, { month: "short", day: "numeric" })}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="git-inline-empty">
              <RemoteIcon size={22} />
              <div>
                <strong>No remote branches yet</strong>
                <p>
                  {data.remotes.length
                    ? "Fetch your remotes to update the branch list."
                    : "Connect a remote repository to see shared branches here."}
                </p>
              </div>
              {data.remotes.length > 0 && (
                <button
                  className="btn"
                  disabled={disabled}
                  onClick={() => void act("fetch")}
                >
                  Fetch remotes
                </button>
              )}
            </div>
          )}
          {filter &&
            remoteBranches.length > 0 &&
            !remoteBranches.some((entry) => match(entry.name)) && (
              <p className="git-list-hint">
                No remote branches match your search.
              </p>
            )}
        </>
      )}
    </div>
  );
}
