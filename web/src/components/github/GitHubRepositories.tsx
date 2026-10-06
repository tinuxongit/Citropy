import { AnimatePresence } from "motion/react";
import { useState } from "react";
import {
  Download,
  FolderGit2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Select } from "../Select.tsx";
import { useGitHub } from "../../lib/use-github.ts";
import { github } from "../../lib/actions.ts";
import {
  GitHubDialog,
  GitHubFeedback,
  GitHubPagination,
  formText,
  githubDate,
} from "./GitHubShared.tsx";
import type { GitHubRepository } from "../../../../shared/github.ts";

export function GitHubRepositories({
  onSelect,
  onClone,
  workspace,
  workspaceName,
  projectId,
  hasCommits,
  onGit,
}: {
  onSelect: (repo: string) => void;
  onClone: (repo: string) => void;
  workspace: string[];
  workspaceName?: string;
  projectId?: string;
  hasCommits: boolean;
  onGit: () => void;
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const list = useGitHub("repositories", { page, query: search, scope });
  return (
    <div className="github-workspace scroll">
      {projectId && !workspace.length && (
        <div className="github-local-workspace">
          <FolderGit2 size={21} />
          <div>
            <strong>{workspaceName}</strong>
            <p>
              {hasCommits
                ? "Publish this workspace, or choose a repository and connect it."
                : "Create your first commit in Source control before publishing this workspace."}
            </p>
          </div>
          <button className="btn" onClick={onGit}>{" "}Source control{" "}</button>
          <button
            className="btn"
            disabled={!hasCommits}
            onClick={() => {
              setPublishing(true);
              setCreating(true);
            }}
          >{" "}Publish workspace{" "}</button>
        </div>
      )}
      {workspace.length > 0 && (
        <div className="github-workspace-repos">
          <span>{workspaceName}{" "}workspace</span>
          {workspace.map((repo) => (
            <button className="btn" key={repo} onClick={() => onSelect(repo)}>
              <FolderGit2 size={15} />
              {repo}
            </button>
          ))}
        </div>
      )}
      <div className="github-toolbar">
        <form
          className="github-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query);
            setPage(1);
          }}
        >
          <Search size={16} />
          <input
            aria-label="Search repositories"
            placeholder={
              scope === "mine" ? "Find a repository…" : "Search all of GitHub…"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn">Search</button>
        </form>
        <Select
          aria-label="Repository scope"
          value={scope}
          onChange={(value) => {
            setScope(value as typeof scope);
            setPage(1);
          }}
          options={[
            { value: "mine", label: "Your repositories" },
            { value: "all", label: "All GitHub" },
          ]}
        />
        <button
          className="icon-btn"
          aria-label="Refresh repositories"
          disabled={list.loading}
          onClick={list.refresh}
        >
          <RefreshCw size={16} />
        </button>
        <button
          className="btn"
          data-variant="primary"
          onClick={() => {
            setPublishing(false);
            setCreating(true);
          }}
        >
          <Plus size={15} />{" "}New repository{" "}</button>
      </div>
      <GitHubFeedback
        error={list.error}
        loading={list.loading && !list.data}
        empty={
          list.data?.items.length === 0 ? "No repositories found" : undefined
        }
      />
      <div className="github-repositories">
        {list.data?.items.map((repo: GitHubRepository) => (
          <article key={repo.id}>
            <img
              className="github-repository-icon"
              src={repo.owner.avatar_url}
              alt={`${repo.owner.login} avatar`}
              loading="lazy"
              width={36}
              height={36}
            />
            <button
              className="github-repository-copy"
              onClick={() => onSelect(repo.full_name)}
            >
              <strong>{repo.full_name}</strong>
              {repo.description && <p>{repo.description}</p>}
              <div className="github-meta">
                {repo.private ? (
                  <span>
                    <LockKeyhole size={12} />{" "}Private{" "}</span>
                ) : (
                  <span>Public</span>
                )}
                {repo.language && <span>{repo.language}</span>}
                {repo.fork && <span>Fork</span>}
                {repo.archived && <span>Archived</span>}
                <span>Updated {githubDate(repo.updated_at)}</span>
              </div>
            </button>
            <button className="btn" onClick={() => onClone(repo.full_name)}>
              <Download size={14} />{" "}Clone{" "}</button>
          </article>
        ))}
      </div>
      {list.data && (
        <GitHubPagination
          page={page}
          more={list.data.more}
          onChange={setPage}
        />
      )}
      <AnimatePresence>{creating && (
        <GitHubDialog
          title={publishing ? "Publish workspace" : "Create repository"}
          description={
            publishing
              ? `Create a GitHub repository for ${workspaceName ?? ""} and push the current branch. Only committed files are published.`
              : "Create a repository in your GitHub account with an initial README. You can clone it after creation."
          }
          submitLabel={publishing ? "Create and publish" : "Create repository"}
          onClose={() => setCreating(false)}
          onSubmit={async (data) => {
            const input = {
              name: formText(data, "name"),
              description: formText(data, "description"),
              private: formText(data, "visibility") === "private",
            };
            const result =
              publishing && projectId
                ? await github("publishRepository", { ...input, projectId })
                : await github("createRepository", input);
            onSelect(result.full_name);
          }}
        >
          <label className="git-field">{" "}Repository name{" "}<input
              name="name"
              placeholder="my-project"
              required
              pattern="[A-Za-z0-9_.\-]+"
            />
          </label>
          <label className="git-field">{" "}Description{" "}<textarea name="description" rows={3} />
          </label>
          <label className="git-field">{" "}Visibility{" "}<Select
              name="visibility"
              defaultValue="private"
              options={[
                { value: "private", label: "Private" },
                { value: "public", label: "Public" },
              ]}
            />
          </label>
        </GitHubDialog>
      )}</AnimatePresence>
    </div>
  );
}
