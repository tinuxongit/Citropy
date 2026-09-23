import { all, api, command } from "./github-cli.ts";
import { pageNumber, positive, repositoryName, text } from "./github-input.ts";
import { mutate } from "./github-mutations.ts";
import { cloneRepository, connectRepository, githubStatus, openSignIn, publishRepository } from "./github-workspace.ts";
import type {
  GitHubRequest,
  GitHubResponse,
  GitHubRepository,
  GitHubItem,
  GitHubComment,
  GitHubFile,
  GitHubCheck,
  GitHubRun,
  GitHubJob,
  GitHubRelease,
  GitHubNotification,
} from "../shared/github.ts";

export async function handleGitHub(
  request: GitHubRequest,
): Promise<GitHubResponse> {
  if ("repo" in request) repositoryName(request.repo);
  switch (request.operation) {
    case "status":
      return githubStatus(request.projectId);
    case "authenticate":
      return openSignIn();
    case "repository":
      return api<GitHubRepository>(`repos/${request.repo}`);
    case "repositories": {
      const page = pageNumber(request.page);
      if (request.scope === "all") {
        const q = text(request.query?.trim() || "stars:>100", "search");
        const result = await api<{
          items: GitHubRepository[];
          total_count: number;
        }>(
          `search/repositories?${new URLSearchParams({ q, per_page: "30", page: String(page), sort: "updated" })}`,
        );
        return {
          items: result.items,
          total: result.total_count,
          more: page * 30 < Math.min(result.total_count, 1000),
        };
      }
      if (request.query?.trim()) {
        const query = text(request.query.trim(), "search").toLowerCase();
        const repos = await all<GitHubRepository>(
          "user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
        );
        const matched = repos.filter((repo) =>
          `${repo.full_name} ${repo.description ?? ""}`
            .toLowerCase()
            .includes(query),
        );
        return {
          items: matched.slice((page - 1) * 30, page * 30),
          total: matched.length,
          more: page * 30 < matched.length,
        };
      }
      const items = await api<GitHubRepository[]>(
        `user/repos?per_page=30&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      );
      return { items, more: items.length === 30 };
    }
    case "items": {
      if (!["open", "closed", "all"].includes(request.state))
        throw new Error("Invalid filter.");
      const page = pageNumber(request.page);
      const q = [
        `repo:${request.repo}`,
        `is:${request.pull ? "pr" : "issue"}`,
        request.state === "all" ? "" : `is:${request.state}`,
        text(request.query ?? "", "search"),
      ]
        .filter(Boolean)
        .join(" ");
      const result = await api<{ items: GitHubItem[]; total_count: number }>(
        `search/issues?${new URLSearchParams({ q, per_page: "30", page: String(page), sort: "updated" })}`,
      );
      return {
        items: result.items,
        total: result.total_count,
        more: page * 30 < Math.min(result.total_count, 1000),
      };
    }
    case "detail": {
      const prefix = `repos/${request.repo}`;
      const number = positive(request.number);
      const [item, comments] = await Promise.all([
        api<GitHubItem>(
          `${prefix}/${request.pull ? "pulls" : "issues"}/${number}`,
        ),
        all<GitHubComment>(`${prefix}/issues/${number}/comments?per_page=100`),
      ]);
      if (!request.pull)
        return {
          item,
          comments,
          reviews: [],
          files: [],
          checks: [],
          statuses: [],
        };
      const sha = item.head!.sha;
      const [reviews, files, checks, statuses] = await Promise.all([
        all<GitHubComment>(`${prefix}/pulls/${number}/reviews?per_page=100`),
        all<GitHubFile>(`${prefix}/pulls/${number}/files?per_page=100`),
        all<GitHubCheck>(
          `${prefix}/commits/${sha}/check-runs?per_page=100`,
          "check_runs",
        ),
        all<{
          id: number;
          context: string;
          state: string;
          target_url: string | null;
        }>(`${prefix}/commits/${sha}/status?per_page=100`, "statuses"),
      ]);
      return { item, comments, reviews, files, checks, statuses };
    }
    case "runs": {
      const result = await api<{
        workflow_runs: GitHubRun[];
        total_count: number;
      }>(
        `repos/${request.repo}/actions/runs?${new URLSearchParams({ per_page: "30", page: String(pageNumber(request.page)), ...(request.branch ? { branch: text(request.branch, "branch") } : {}) })}`,
      );
      return {
        items: result.workflow_runs,
        total: result.total_count,
        more: pageNumber(request.page) * 30 < result.total_count,
      };
    }
    case "run": {
      const id = positive(request.id);
      const [run, jobs] = await Promise.all([
        api<GitHubRun>(`repos/${request.repo}/actions/runs/${id}`),
        all<GitHubJob>(
          `repos/${request.repo}/actions/runs/${id}/jobs?per_page=100`,
          "jobs",
        ),
      ]);
      return { run, jobs };
    }
    case "logs":
      return command("gh", [
        "run",
        "view",
        "--job",
        String(positive(request.jobId)),
        "--log",
        "--repo",
        request.repo,
      ]);
    case "workflows":
      return all<{
        id: number;
        name: string;
        path: string;
        state: string;
        html_url: string;
      }>(`repos/${request.repo}/actions/workflows?per_page=100`, "workflows");
    case "branches": {
      const branches = await all<{ name: string }>(
        `repos/${request.repo}/branches?per_page=100`,
      );
      return branches.map((branch) => branch.name);
    }
    case "releases": {
      const items = await api<GitHubRelease[]>(
        `repos/${request.repo}/releases?per_page=30&page=${pageNumber(request.page)}`,
      );
      return { items, more: items.length === 30 };
    }
    case "notifications": {
      const items = await api<GitHubNotification[]>(
        `notifications?per_page=30&page=${pageNumber(request.page)}&all=${Boolean(request.all)}`,
      );
      return { items, more: items.length === 30 };
    }
    case "clone":
      return cloneRepository(request);
    case "connectRepository":
      return connectRepository(request);
    case "publishRepository":
      return publishRepository(request);
    case "createRepository": {
      const name = text(request.name, "repository name", true);
      if (!/^[A-Za-z0-9_.-]+$/.test(name) || [".", ".."].includes(name))
        throw new Error(
          "Use letters, numbers, dots, hyphens, or underscores in the repository name.",
        );
      return api<GitHubRepository>("user/repos", "POST", {
        name,
        description: text(request.description, "description"),
        private: Boolean(request.private),
        auto_init: true,
      });
    }
    case "mutate":
      return mutate(request.repo, request.mutation);
    default:
      throw new Error("Unsupported GitHub request.");
  }
}
