import { spawn } from "node:child_process";
import { stat, mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { chooseFolder } from "./folder-picker.ts";
import { remoteId, workspaceDirectory } from "./remote.ts";
import { store } from "./store.ts";
import { api, command } from "./github-cli.ts";
import { repositoryFromRemote, repositoryName, text } from "./github-input.ts";
import type {
  GitHubRequest,
  GitHubRepository,
  GitHubStatus,
  GitHubUser,
} from "../shared/github.ts";

type Request<T extends GitHubRequest["operation"]> = Extract<GitHubRequest, { operation: T }>;

function projectFor(projectId: string) {
  const project = store.projects.get(projectId);
  if (!project) throw new Error("Workspace not found.");
  return project;
}

export async function githubStatus(projectId?: string): Promise<GitHubStatus> {
  const result: GitHubStatus = { installed: false, repositories: [] };
  try {
    await command("gh", ["--version"]);
    result.installed = true;
    result.account = await api<GitHubUser>("user");
  } catch (error) {
    result.error = (error as Error).message;
  }
  const project = projectId ? store.projects.get(projectId) : undefined;
  if (project) {
    try {
      const output = await command(
        "git",
        ["remote", "-v"],
        undefined,
        project.path,
      );
      const seen = new Set<string>();
      for (const line of output.split("\n")) {
        const [name, url, direction] = line.split(/\s+/);
        const repo = url ? repositoryFromRemote(url) : null;
        if (name && repo && direction === "(fetch)" && !seen.has(repo)) {
          result.repositories.push({ name, repo });
          seen.add(repo);
        }
      }
      result.repositories.sort(
        (a, b) => Number(b.name === "origin") - Number(a.name === "origin"),
      );
      result.hasCommits = await command(
        "git",
        ["rev-parse", "--verify", "HEAD"],
        undefined,
        project.path,
      ).then(
        () => true,
        () => false,
      );
      result.branch = (
        await command(
          "git",
          ["branch", "--show-current"],
          undefined,
          project.path,
        )
      ).trim();
    } catch {}
  }
  return result;
}

export async function openSignIn(): Promise<{ message: string }> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "konsole",
      [
        "--separate",
        "-e",
        "gh",
        "auth",
        "login",
        "--hostname",
        "github.com",
        "--git-protocol",
        "https",
        "--web",
      ],
      { detached: true, stdio: "ignore", env: process.env },
    );
    child.once("error", () =>
      reject(
        new Error(
          "Could not open the sign-in window. Run gh auth login in your terminal, then refresh.",
        ),
      ),
    );
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return {
    message:
      "Complete sign-in in the terminal window, then refresh the connection.",
  };
}

export async function cloneRepository(request: Request<"clone">) {
  const repo = repositoryName(request.repo);
  if (remoteId && !request.parent) throw new Error("Choose a destination folder on the SSH host.");
  const parent = request.parent ? await workspaceDirectory(request.parent) : await chooseFolder(
    "Choose where to clone this repository",
  );
  if (!parent) return { project: null };
  if (!(await stat(parent)).isDirectory())
    throw new Error("Choose a destination folder.");
  const destination = join(parent, repo.split("/")[1]!);
  await mkdir(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST")
      throw new Error(
        "A folder with this repository name already exists. Choose a different parent folder or open the existing workspace.",
      );
    throw error;
  });
  try {
    await command(
      "gh",
      ["repo", "clone", repo, destination],
      undefined,
      parent,
      180_000,
    );
  } catch (error) {
    await rmdir(destination).catch(() => {});
    throw error;
  }
  return { project: store.openProject(destination) };
}

export async function connectRepository(request: Request<"connectRepository">): Promise<{ message: string }> {
  const project = projectFor(request.projectId);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.remote))
    throw new Error("Enter a valid remote name.");
  await api<GitHubRepository>(`repos/${request.repo}`);
  await command(
    "git",
    [
      "remote",
      "add",
      request.remote,
      `https://github.com/${request.repo}.git`,
    ],
    undefined,
    project.path,
  );
  return {
    message: `${request.repo} connected as ${request.remote}. Fetch or push from Source control when you are ready.`,
  };
}

export async function publishRepository(request: Request<"publishRepository">): Promise<GitHubRepository> {
  const project = projectFor(request.projectId);
  const name = text(request.name, "repository name", true);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
    throw new Error("Enter a valid repository name.");
  await command(
    "git",
    ["rev-parse", "--verify", "HEAD"],
    undefined,
    project.path,
  ).catch(() => {
    throw new Error(
      "Create your first commit in Source control before publishing.",
    );
  });
  const remotes = (
    await command("git", ["remote"], undefined, project.path)
  )
    .trim()
    .split("\n");
  if (remotes.includes("origin"))
    throw new Error(
      "This workspace already has an origin remote. Manage it in Source control before publishing a new repository.",
    );
  const branch = (
    await command(
      "git",
      ["branch", "--show-current"],
      undefined,
      project.path,
    )
  ).trim();
  if (!branch)
    throw new Error(
      "Switch to a branch in Source control before publishing.",
    );
  const account = await api<GitHubUser>("user");
  try {
    await command(
      "gh",
      [
        "repo",
        "create",
        name,
        request.private ? "--private" : "--public",
        "--description",
        text(request.description, "description"),
        "--source",
        project.path,
        "--remote",
        "origin",
        "--push",
      ],
      undefined,
      project.path,
      180_000,
    );
  } catch (error) {
    throw new Error(
      `${(error as Error).message}\nIf the repository was created, open ${account.login}/${name} and use Source control to finish pushing. Avoid creating it again.`,
    );
  }
  return api<GitHubRepository>(`repos/${account.login}/${name}`);
}
