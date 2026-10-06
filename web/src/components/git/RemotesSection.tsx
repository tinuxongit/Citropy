import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Globe2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { EmptyState } from "./GitEmptyState.tsx";
import type { GitDialogAction } from "../GitDialog.tsx";
import type { GitOperation, GitOverview } from "../../../../shared/protocol.ts";

export function RemotesSection({
  data,
  disabled,
  branch,
  upstream,
  showDialog,
  act,
  addRemote,
}: {
  data: GitOverview;
  disabled: boolean;
  branch: string;
  upstream: string | null | undefined;
  showDialog: (action: GitDialogAction) => void;
  act: (
    operation: GitOperation,
    value?: string,
    page?: number,
    remote?: string,
  ) => Promise<boolean>;
  addRemote: () => void;
}) {
  return (
    <div className="git-page scroll">
      <header className="git-section-heading">
        <div>
          <p>Connect repositories and keep your work in sync.</p>
        </div>
        {data.remotes.length > 0 && (
          <button
            className="btn"
            disabled={disabled}
            onClick={addRemote}
          >
            <Plus size={15} />
            Add remote
          </button>
        )}
      </header>
      {!data.remotes.length ? (
        <EmptyState
          title="Your work is local"
          action={
            <button
              className="btn"
              data-variant="primary"
              disabled={disabled}
              onClick={addRemote}
            >
              <Plus size={15} />
              Connect a remote
            </button>
          }
        >
          <p>{" "}Add a remote repository to back up your commits and collaborate. Nothing is published until you choose to push.{" "}</p>
        </EmptyState>
      ) : (
        <>
          <div className="git-sync">
            <div className="git-sync-title">
              <GitBranch size={20} />
              <div>
                <h3>{branch}</h3>
                <p>
                  {!data.hasCommits
                    ? "Create a first commit before publishing."
                    : upstream
                      ? "Tracking " + upstream
                      : branch === "detached"
                        ? "Switch to a branch before publishing."
                        : "Publish this branch to set up an upstream."}
                </p>
              </div>
            </div>
            {upstream && (
              <div className="git-sync-counts">
                <span>
                  <ArrowUp size={15} />
                  <strong>{data.status?.ahead ?? 0}</strong>to push{" "}</span>
                <span>
                  <ArrowDown size={15} />
                  <strong>{data.status?.behind ?? 0}</strong>to pull{" "}</span>
              </div>
            )}
            <div className="git-inline-actions">
              <button
                className="btn"
                disabled={disabled}
                onClick={() => void act("fetch")}
              >
                <RefreshCw size={14} />
                Fetch
              </button>
              {upstream && (
                <>
                  <button
                    className="btn"
                    disabled={disabled || data.mergeInProgress}
                    title="Pull with fast-forward only"
                    onClick={() => void act("pull")}
                  >
                    <ArrowDown size={14} />
                    Pull
                  </button>
                  <button
                    className="btn"
                    data-variant="primary"
                    disabled={disabled || data.mergeInProgress}
                    onClick={() =>
                      showDialog({
                        operation: "push",
                        title: "Push commits?",
                        description: `Send commits from ${branch} to ${upstream ?? ""}.`,
                        label: "Push commits",
                      })
                    }
                  >
                    <ArrowUp size={14} />
                    Push
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="git-table-heading">
            <h3>
            Connected repositories
              <span className="git-count">
                {data.remotes.length}
              </span>
            </h3>
          </div>
          {data.remotes.map((remote) => (
            <div className="git-remote-row" key={remote.name}>
              <Globe2 size={20} className="muted" />
              <div className="git-row-main">
                <strong>{remote.name}</strong>
                <code>{remote.url}</code>
              </div>
              <div className="git-inline-actions">
                {!upstream?.startsWith(remote.name + "/") &&
                  data.hasCommits &&
                  branch !== "detached" && (
                    <button
                      className="btn"
                      data-variant={
                        !upstream ? "primary" : undefined
                      }
                      disabled={disabled || data.mergeInProgress}
                      onClick={() =>
                        showDialog({
                          operation: "publish",
                          value: remote.name,
                          title: `Publish ${branch}?`,
                          description: `Push this branch to ${remote.name} and use it as the upstream for future pulls and pushes.`,
                          label: "Publish branch",
                        })
                      }
                    >
                      <ArrowUp size={14} />
                      Publish branch
                    </button>
                  )}
                <button
                  className="icon-btn git-danger"
                  title={"Remove " + remote.name}
                  disabled={disabled}
                  onClick={() =>
                    showDialog({
                      operation: "removeRemote",
                      value: remote.name,
                      title: `Disconnect ${remote.name}?`,
                      description: `Remove this local remote configuration. The repository at ${remote.url} will not be deleted.`,
                      label: "Disconnect remote",
                      danger: true,
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          <p className="git-page-note">{" "}Fetch checks for remote updates. Pull brings them into your branch using fast-forward only.{" "}</p>
        </>
      )}
    </div>
  );
}
