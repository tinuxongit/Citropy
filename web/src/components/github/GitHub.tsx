import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Check,
  CircleDot,
  Download,
  GitBranch,
  GitFork,
  GitPullRequest,
  Play,
  Star,
  Tag,
  UserRound,
} from "lucide-react";
import { SectionLink, SectionSidebar } from "../SectionSidebar.tsx";
import { useApp, selectProject } from "../../lib/store.ts";
import { useGitHub } from "../../lib/use-github.ts";
import { github } from "../../lib/actions.ts";
import { GitHubItems } from "./GitHubItems.tsx";
import { GitHubActions } from "./GitHubActions.tsx";
import { GitHubReleases } from "./GitHubReleases.tsx";
import { GitHubRepositories } from "./GitHubRepositories.tsx";
import { GitHubNotifications } from "./GitHubNotifications.tsx";
import { GitHubAccount, GitHubSignIn } from "./GitHubAccount.tsx";
import {
  GitHubDialog,
  GitHubFeedback,
  GitHubLink,
  formText,
} from "./GitHubShared.tsx";
import { PixelLoader } from "../PixelLoader.tsx";

const sections = [
  { name: "Repositories", icon: BookOpen, global: true },
  { name: "Pull requests", icon: GitPullRequest, global: false },
  { name: "Issues", icon: CircleDot, global: false },
  { name: "Actions", icon: Play, global: false },
  { name: "Releases", icon: Tag, global: false },
  { name: "Notifications", icon: Bell, global: true },
] as const;
type Section = (typeof sections)[number]["name"] | "Account";

export function GitHub({
  sidebarOpen,
  onNavigate,
  onBack,
  onGit,
  status,
}: {
  sidebarOpen: boolean;
  onNavigate: () => void;
  onBack: () => void;
  onGit: () => void;
  status: ReturnType<typeof useGitHub<"status">>;
}) {
  const connected = useApp((state) => state.connected);
  const projectId = useApp((state) => state.activeProjectId);
  const project = useApp((state) =>
    state.projects.find((project) => project.id === projectId),
  );
  const [section, setSection] = useState<Section>("Repositories");
  const [repo, setRepo] = useState("");
  const repository = useGitHub(
    "repository",
    repo && status.data?.account ? { repo } : null,
  );
  const [clone, setClone] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [fork, setFork] = useState(false);
  const [message, setMessage] = useState("");
  const chooseRepo = (name: string) => {
    setRepo(name);
    setSection("Pull requests");
    setMessage("");
    onNavigate();
  };
  useEffect(() => {
    if (!repo && status.data?.repositories[0])
      setRepo(status.data.repositories[0].repo);
  }, [status.data, repo]);
  const workspaceHasRepo = Boolean(
    status.data?.repositories.some((remote) => remote.repo === repo),
  );
  const global =
    section === "Account" ||
    sections.find((entry) => entry.name === section)?.global;
  return (
    <section className="section-view github-view" aria-label="GitHub">
      <SectionSidebar activeItem={section} open={sidebarOpen} title="GitHub">
          {sections.map(({ name, icon, global }) => (
            <SectionLink
              key={name}
              icon={icon}
              label={name}
              active={section === name}
              disabled={!global && !repo}
              onSelect={() => {
                setSection(name);
                onNavigate();
              }}
            />
          ))}
          {repo && (
            <div className="github-sidebar-repo">
              <span>Selected repository</span>
              <strong>{repo}</strong>
            </div>
          )}
          <button
            type="button"
            className="github-sidebar-account"
            aria-label={
              status.data?.account
                ? `Account settings for ${status.data.account.login}`
                : "Connect GitHub account"
            }
            aria-current={section === "Account" ? "page" : undefined}
            onClick={() => {
              setSection("Account");
              onNavigate();
            }}
          >
            {status.data?.account ? (
              <img src={status.data.account.avatar_url} alt="" />
            ) : (
              <UserRound size={21} />
            )}
            <span>{status.data?.account?.login ?? "Connect GitHub"}</span>
            {status.data?.account && <Check size={14} />}
          </button>
      </SectionSidebar>
      <div className="github-main">
        <header className="github-heading">
          <div className="github-heading-copy">
            <h1>{global ? section : repo || section}</h1>
            {!global && repository.data?.description && <p>{repository.data.description}</p>}
          </div>
          {!global && repository.data && (
            <div className="github-repo-actions">
              <button
                className="btn"
                onClick={() => setSection("Repositories")}
              >
                <BookOpen size={15} />{" "}Browse{" "}</button>
              <button className="btn" onClick={() => setClone(repo)}>
                <Download size={15} />{" "}Clone{" "}</button>
              <GitHubLink href={repository.data.html_url}>GitHub</GitHubLink>
            </div>
          )}
        </header>
        {!connected && (
          <div className="github-connection" role="status">
            <PixelLoader size={16} />
            <span>Reconnecting to Citropy… Your loaded pages will stay here.</span>
          </div>
        )}
        <GitHubFeedback
          error={status.error}
          loading={status.loading && !status.data}
        />
        {message && !status.data?.account && (
          <p className="github-notice" role="status">
            {message}
          </p>
        )}
        {status.data && !status.data.account && (
          <GitHubSignIn
            status={status.data}
            onMessage={setMessage}
            onRefresh={status.refresh}
          />
        )}
        {status.data?.account && (
          <>
            {message && (
              <p className="github-notice" role="status">
                {message}
              </p>
            )}
            {section === "Repositories" && (
              <GitHubRepositories
                onSelect={chooseRepo}
                onClone={setClone}
                workspace={status.data.repositories.map(
                  (remote) => remote.repo,
                )}
                workspaceName={project?.name}
                projectId={projectId ?? undefined}
                hasCommits={Boolean(status.data.hasCommits)}
                onGit={onGit}
              />
            )}
            {section === "Notifications" && (
              <GitHubNotifications onSelect={chooseRepo} />
            )}
            {section === "Account" && (
              <GitHubAccount
                account={status.data.account}
                workspaceRepo={status.data.repositories[0]?.repo}
                loading={status.loading}
                onRefresh={status.refresh}
              />
            )}
            {!global && (
              <>
                <GitHubFeedback
                  error={repository.error}
                  loading={repository.loading && !repository.data}
                />
                {repository.data && (
                  <>
                    <div className="github-repo-metadata">
                      <span>
                        <GitBranch size={14} />
                        {repository.data.default_branch}
                      </span>
                      <span>
                        <Star size={14} />
                        {repository.data.stargazers_count}
                      </span>
                      <span>
                        <GitFork size={14} />
                        {repository.data.forks_count}
                      </span>
                      <span>
                        {repository.data.private ? "Private" : "Public"}
                      </span>
                      {repository.data.archived && <span>Archived</span>}
                      {projectId && !workspaceHasRepo && (
                          <button onClick={() => setConnecting(true)}>{" "}Connect workspace{" "}</button>
                        )}
                      <button onClick={() => setFork(true)}>{" "}Fork repository{" "}</button>
                    </div>
                    {section === "Pull requests" || section === "Issues" ? (
                      <GitHubItems
                        key={`${repo}-${section}`}
                        repository={repository.data}
                        currentUser={status.data.account.login}
                        pull={section === "Pull requests"}
                        branch={workspaceHasRepo ? status.data.branch : undefined}
                      />
                    ) : section === "Actions" ? (
                      <GitHubActions key={repo} repository={repository.data} />
                    ) : (
                      <GitHubReleases key={repo} repository={repository.data} />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      <AnimatePresence>{clone && (
        <GitHubDialog
          title="Clone repository"
          description={`Clone ${clone} into a new folder named ${clone.split("/")[1]!}. Choose its parent folder in the system file explorer.`}
          submitLabel="Choose folder and clone"
          onClose={() => setClone(null)}
          onSubmit={async () => {
            const result = await github("clone", { repo: clone });
            if (result.project) {
              selectProject(result.project.id);
              onBack();
            }
          }}
        >
          <p className="github-meta">{" "}The repository will open as a workspace when the clone finishes. Existing folders will be preserved.{" "}</p>
        </GitHubDialog>
      )}</AnimatePresence>
      <AnimatePresence>{connecting && projectId && (
        <GitHubDialog
          title="Connect workspace"
          description={`Connect ${project?.name ?? ""} to ${repo}. This adds a Git remote without pulling or pushing any files.`}
          submitLabel="Connect repository"
          onClose={() => setConnecting(false)}
          onSubmit={async (data) => {
            setMessage(
              (
                await github("connectRepository", {
                  projectId,
                  repo,
                  remote: formText(data, "remote"),
                })
              ).message,
            );
            status.refresh();
          }}
        >
          <label className="git-field">{" "}Remote name{" "}<input name="remote" defaultValue="origin" required />
          </label>
        </GitHubDialog>
      )}</AnimatePresence>
      <AnimatePresence>{fork && (
        <GitHubDialog
          title="Fork repository"
          description={`Create a copy of ${repo} in your GitHub account.`}
          submitLabel="Create fork"
          onClose={() => setFork(false)}
          onSubmit={async () => {
            const result = await github("mutate", {
              repo,
              mutation: { action: "fork" },
            });
            setMessage(result.message);
            repository.refresh();
          }}
        />
      )}</AnimatePresence>
    </section>
  );
}
