import { useEffect, useState } from "react";
import { GitHubIcon } from "../icons/BrandIcon.tsx";
import { RefreshIcon } from "../icons/rotation.tsx";
import { Modal } from "../Modal.tsx";
import { Select } from "../Select.tsx";
import { Loader } from "../Loader.tsx";
import { ActionError } from "../ActionError.tsx";
import { GitHubSignIn } from "./GitHubAccount.tsx";
import { GitHubFeedback, GitHubPagination, githubDate } from "./GitHubShared.tsx";
import { useGitHub } from "../../lib/use-github.ts";
import { github } from "../../lib/actions.ts";
import { environmentId, environmentName } from "../../lib/environment.ts";
import { selectProject, useApp } from "../../lib/store.ts";

const SEARCH_DELAY_MS = 300;

export function CloneFromGitHub({ onClose }: { onClose: () => void }) {
  const connected = useApp((state) => state.connected);
  const status = useGitHub("status", {});
  const account = status.data?.account;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [page, setPage] = useState(1);
  const list = useGitHub("repositories", account ? { page, query: search, scope } : null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const clone = async (repo: string) => {
    setBusy(repo);
    setError("");
    try {
      const result = await github("clone", { repo });
      if (result.project) {
        selectProject(result.project.id);
        onClose();
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <Modal
      title="Clone from GitHub"
      description={`Pick a repository${environmentId() === "local" ? "" : ` to clone on ${environmentName()}`}. You choose its parent folder next.`}
      icon={<GitHubIcon size={20} />}
      onClose={onClose}
      busy={Boolean(busy)}
      className="session-import-dialog"
      footer={
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={onClose}>
          Close
        </button>
      }
    >
      <GitHubFeedback error={status.error} loading={status.loading && !status.data} />
      {status.data && !account && (
        <>
          {message && (
            <p className="github-notice" role="status">
              {message}
            </p>
          )}
          <GitHubSignIn status={status.data} onMessage={setMessage} onRefresh={status.refresh} />
        </>
      )}
      {account && (
        <>
          <div className="feature-field feature-inline session-import-controls">
            <Select
              aria-label="Repository scope"
              value={scope}
              disabled={Boolean(busy)}
              onChange={(value) => {
                setScope(value as typeof scope);
                setPage(1);
              }}
              options={[
                { value: "mine", label: "Your repositories" },
                { value: "all", label: "All GitHub" },
              ]}
            />
            <input
              autoFocus
              aria-label="Find a repository"
              placeholder={scope === "mine" ? "Find a repository" : "Search all of GitHub"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Refresh repositories"
              disabled={list.loading || Boolean(busy)}
              onClick={list.refresh}
            >
              <RefreshIcon size={16} />
            </button>
          </div>
          <ActionError className="dialog-error" message={error} onDismiss={() => setError("")} />
          <GitHubFeedback
            error={list.error}
            loading={list.loading && !list.data}
            empty={list.data?.items.length === 0 ? "No repositories found" : undefined}
          />
          {Boolean(list.data?.items.length) && (
            <div className="session-import-list">
              {list.data!.items.map((repo) => (
                <div className="session-import-row" key={repo.id}>
                  <div>
                    <strong>{repo.full_name}</strong>
                    {repo.description && <small>{repo.description}</small>}
                    <small>
                      {[
                        repo.private ? "Private" : "Public",
                        repo.language,
                        `Updated ${githubDate(repo.updated_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    disabled={!connected || Boolean(busy)}
                    aria-label={`Clone ${repo.full_name}`}
                    onClick={() => void clone(repo.full_name)}
                  >
                    {busy === repo.full_name ? <Loader size={14} /> : null}Clone
                  </button>
                </div>
              ))}
            </div>
          )}
          {list.data && <GitHubPagination page={page} more={list.data.more} onChange={setPage} />}
        </>
      )}
    </Modal>
  );
}
