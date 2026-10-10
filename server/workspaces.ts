import { dataRoot } from "./paths.ts";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { uid } from "./ids.ts";
import { store } from "./store.ts";
import { git, isRepo, tryGit } from "./git.ts";
import { resolveProjectSettings } from "../shared/project-settings.ts";
import type { Project, WorkspaceChoice } from "../shared/protocol.ts";
import type { WorkspaceOptions } from "../shared/features.ts";

export function workspacePath(projectId: string, threadId?: string): string {
  const project = store.projects.get(projectId);
  if (!project) throw new Error("Workspace not found");
  if (!threadId) return project.path;
  const thread = store.threads.get(threadId);
  if (!thread || thread.projectId !== projectId)
    throw new Error("Conversation belongs to another workspace");
  return thread.workspacePath ?? project.path;
}

export function resolveWorkspace(projectId: string, threadId?: string): Project | undefined {
  const project = store.projects.get(projectId);
  if (!project) return undefined;
  return { ...project, path: workspacePath(project.id, threadId) };
}

export async function workspaceOptions(
  project: Project,
): Promise<WorkspaceOptions> {
  if (!(await isRepo(project.path))) return { worktrees: [], branches: [], hasCommits: false };
  const raw = await git(project.path, [
    "worktree",
    "list",
    "--porcelain",
    "-z",
  ]);
  const worktrees = raw
    .split("\0\0")
    .filter(Boolean)
    .flatMap((block) => {
      const lines = block.split("\0");
      const path = lines
        .find((line) => line.startsWith("worktree "))
        ?.slice(9);
      if (!path || lines.includes("bare")) return [];
      return [
        {
          path,
          branch:
            lines
              .find((line) => line.startsWith("branch "))
              ?.slice(7)
              .replace(/^refs\/heads\//, "") ?? "Detached HEAD",
          current: path === project.path,
          locked: lines.some((line) => line.startsWith("locked")),
        },
      ];
    });
  const branches = (
    await git(project.path, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      "refs/remotes",
    ])
  )
    .split("\n")
    .filter(Boolean);
  const hasCommits = Boolean((await tryGit(project.path, ["rev-parse", "--verify", "HEAD"])).trim());
  return { worktrees, branches, hasCommits };
}

export function managedWorktreeRoot(projectId: string): string {
  return join(dataRoot, "worktrees", projectId);
}

export function newWorktreeBranch(): string {
  return `citropy/${uid("work")}`;
}

export async function createManagedWorktree(project: Project, branch: string, base: string): Promise<string> {
  const root = managedWorktreeRoot(project.id);
  await mkdir(root, { recursive: true });
  const path = join(root, uid("checkout"));
  await git(project.path, ["worktree", "add", "-b", branch, path, base]);
  return path;
}

export async function chooseThreadWorkspace(
  project: Project,
  choice?: WorkspaceChoice,
): Promise<{ workspacePath: string; workspaceBranch?: string }> {
  const defaults = resolveProjectSettings(store.projectDefaults, project.settings);
  const options = choice ?? { kind: defaults.workspace ?? "current" };
  if (options.kind === "current") {
    if (!(await isRepo(project.path))) return { workspacePath: project.path };
    if (defaults.autoPull) {
      const clean = !(await tryGit(project.path, ["status", "--porcelain"]));
      const ahead = await tryGit(project.path, ["rev-list", "--count", "@{upstream}..HEAD"]);
      if (clean && ahead.trim() === "0")
        await git(project.path, ["pull", "--ff-only"]);
    }
    return {
      workspacePath: project.path,
      workspaceBranch: (await tryGit(project.path, ["branch", "--show-current"])).trim() || undefined,
    };
  }
  const available = await workspaceOptions(project);
  if (options.kind === "existing") {
    const path = await realpath(options.path ?? "");
    const found = available.worktrees.find((entry) => entry.path === path);
    if (!found || found.locked)
      throw new Error("Choose an available worktree from this repository.");
    return { workspacePath: found.path, workspaceBranch: found.branch };
  }
  if (options.kind !== "new") throw new Error("Unknown workspace selection");
  if (!available.hasCommits)
    throw new Error(
      "Create the repository's first commit before creating a worktree.",
    );
  const branch = options.branch?.trim() || newWorktreeBranch();
  await git(project.path, ["check-ref-format", "--branch", branch]);
  if (branch.startsWith("-")) throw new Error("Invalid branch name");
  const base = options.base || "HEAD";
  if (base !== "HEAD" && !available.branches.includes(base))
    throw new Error(
      "Choose a branch from this repository as the starting point.",
    );
  const path = await createManagedWorktree(project, branch, base);
  return { workspacePath: path, workspaceBranch: branch };
}
