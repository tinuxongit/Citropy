import { api, command } from "./github-cli.ts";
import { names, positive, repositoryName, text } from "./github-input.ts";
import type {
  GitHubItem,
  GitHubMutation,
  GitHubRelease,
  GitHubRepository,
} from "../shared/github.ts";

export async function mutate(
  repo: string,
  mutation: GitHubMutation,
): Promise<{ message: string; url?: string }> {
  const prefix = `repos/${repositoryName(repo)}`;
  switch (mutation.action) {
    case "createIssue": {
      const item = await api<GitHubItem>(`${prefix}/issues`, "POST", {
        title: text(mutation.title, "title", true),
        body: text(mutation.body, "description"),
        labels: names(mutation.labels),
        assignees: names(mutation.assignees),
      });
      return { message: `Issue #${item.number} created.`, url: item.html_url };
    }
    case "createPull": {
      const item = await api<GitHubItem>(`${prefix}/pulls`, "POST", {
        title: text(mutation.title, "title", true),
        body: text(mutation.body, "description"),
        head: text(mutation.head, "head branch", true),
        base: text(mutation.base, "base branch", true),
        draft: Boolean(mutation.draft),
      });
      return {
        message: `Pull request #${item.number} created.`,
        url: item.html_url,
      };
    }
    case "editItem":
      await api(`${prefix}/issues/${positive(mutation.number)}`, "PATCH", {
        title: text(mutation.title, "title", true),
        body: text(mutation.body, "description"),
        labels: names(mutation.labels),
        assignees: names(mutation.assignees),
      });
      return { message: "Changes saved on GitHub." };
    case "comment":
      await api(
        `${prefix}/issues/${positive(mutation.number)}/comments`,
        "POST",
        { body: text(mutation.body, "comment", true) },
      );
      return { message: "Comment posted." };
    case "state":
      if (!["open", "closed"].includes(mutation.state))
        throw new Error("Invalid state.");
      await api(
        `${prefix}/${mutation.pull ? "pulls" : "issues"}/${positive(mutation.number)}`,
        "PATCH",
        { state: mutation.state },
      );
      return {
        message:
          mutation.state === "open"
            ? "Reopened on GitHub."
            : "Closed on GitHub.",
      };
    case "review":
      if (!["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(mutation.event))
        throw new Error("Invalid review.");
      await api(
        `${prefix}/pulls/${positive(mutation.number)}/reviews`,
        "POST",
        {
          event: mutation.event,
          body: text(mutation.body, "review", mutation.event !== "APPROVE"),
          commit_id: text(mutation.sha, "commit", true),
        },
      );
      return { message: "Review submitted." };
    case "merge": {
      if (
        !["merge", "squash", "rebase"].includes(mutation.method) ||
        !/^[0-9a-f]{40,64}$/i.test(mutation.sha)
      )
        throw new Error("Refresh the pull request before merging.");
      const result = await api<{ merged: boolean; message: string }>(
        `${prefix}/pulls/${positive(mutation.number)}/merge`,
        "PUT",
        { merge_method: mutation.method, sha: mutation.sha },
      );
      if (!result.merged)
        throw new Error(
          result.message || "GitHub did not merge the pull request.",
        );
      return { message: "Pull request merged." };
    }
    case "ready":
      await command("gh", [
        "pr",
        "ready",
        String(positive(mutation.number)),
        "--repo",
        repo,
      ]);
      return { message: "Pull request marked ready for review." };
    case "requestReview":
      await api(
        `${prefix}/pulls/${positive(mutation.number)}/requested_reviewers`,
        "POST",
        { reviewers: names(mutation.reviewers) },
      );
      return { message: "Review requested." };
    case "rerun":
      await api(
        `${prefix}/actions/runs/${positive(mutation.id)}/${mutation.failedOnly ? "rerun-failed-jobs" : "rerun"}`,
        "POST",
      );
      return { message: "Workflow rerun requested." };
    case "cancelRun":
      await api(
        `${prefix}/actions/runs/${positive(mutation.id)}/cancel`,
        "POST",
      );
      return { message: "Workflow cancellation requested." };
    case "dispatch":
      if (
        !mutation.inputs ||
        typeof mutation.inputs !== "object" ||
        Array.isArray(mutation.inputs) ||
        Object.keys(mutation.inputs).length > 25 ||
        Object.values(mutation.inputs).some(
          (value) => typeof value !== "string",
        )
      )
        throw new Error(
          "Workflow inputs must be a JSON object with text values.",
        );
      await api(
        `${prefix}/actions/workflows/${positive(mutation.id)}/dispatches`,
        "POST",
        {
          ref: text(mutation.ref, "branch or tag", true),
          inputs: mutation.inputs,
        },
      );
      return { message: "Workflow started. It may take a moment to appear." };
    case "fork": {
      const fork = await api<GitHubRepository>(`${prefix}/forks`, "POST");
      return {
        message: `Fork created: ${fork.full_name}.`,
        url: fork.html_url,
      };
    }
    case "markRead":
      if (!/^\d+$/.test(mutation.id)) throw new Error("Invalid notification.");
      await api(`notifications/threads/${mutation.id}`, "PATCH");
      return { message: "Notification marked as read." };
    case "createRelease": {
      const release = await api<GitHubRelease>(`${prefix}/releases`, "POST", {
        tag_name: text(mutation.tag, "tag", true),
        target_commitish: text(mutation.target, "branch or commit", true),
        name: text(mutation.name, "release name", true),
        body: text(mutation.body, "release notes"),
        draft: Boolean(mutation.draft),
        prerelease: Boolean(mutation.prerelease),
      });
      return {
        message: mutation.draft ? "Release draft saved." : "Release published.",
        url: release.html_url,
      };
    }
    default:
      throw new Error("Unsupported GitHub action.");
  }
}
