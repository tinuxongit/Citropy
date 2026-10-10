import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { hasCode, logFailure } from "../shared/expected-errors.mjs";
import { downloadVerified } from "../shared/verified-download.mjs";
import type { GitRuntimeStatus } from "../shared/runtime-downloads.ts";
import { minGitBuild, minGitCommands, minGitFolder } from "./mingit.ts";
import { clearCommandCache, commandVersion, resolveCommand } from "./providers/binary.ts";

const DOWNLOAD_TIMEOUT = 300_000;
const DOWNLOAD_MAX_BYTES = 80 * 1024 * 1024;
const EXTRACT_TIMEOUT = 120_000;
const PACKAGE_INSTALL_TIMEOUT = 15 * 60_000;
const APPLE_INSTALLER_WAIT = 30 * 60_000;
const APPLE_CHECK_INTERVAL = 5_000;
const POLKIT_DISMISSED = [126, 127];
const PACKAGE_MANAGERS = [
  { command: "pacman", args: ["-S", "--needed", "--noconfirm", "git"] },
  { command: "apt-get", args: ["install", "-y", "git"] },
  { command: "dnf", args: ["install", "-y", "git"] },
  { command: "zypper", args: ["--non-interactive", "install", "git"] },
  { command: "apk", args: ["add", "git"] },
];

const run = promisify(execFile);

export type GitInstallPlan =
  | { kind: "download"; method: string; url: string; sha256: string }
  | { kind: "apple"; method: string }
  | { kind: "package"; method: string; command: string; args: string[] }
  | { kind: "manual"; method: string };

export function gitInstallPlan(platform: NodeJS.Platform, arch: string, has: (command: string) => boolean): GitInstallPlan {
  if (platform === "win32") {
    const build = minGitBuild(arch);
    return build
      ? { kind: "download", method: "Downloads Portable Git for Windows into Citropy's folder.", ...build }
      : { kind: "manual", method: "Install Git for Windows from git-scm.com, then check again." };
  }
  if (platform === "darwin") return { kind: "apple", method: "Opens Apple's installer for the command line developer tools, which include Git." };
  const manager = PACKAGE_MANAGERS.find(entry => has(entry.command));
  if (!manager) return { kind: "manual", method: "Install git with your system's package manager, then check again." };
  const command = ["sudo", manager.command, ...manager.args].join(" ");
  if (!has("pkexec")) return { kind: "manual", method: `Run "${command}" in a terminal, then check again.` };
  return { kind: "package", method: `Installs git with ${manager.command}. Your system asks for your password.`, command: "pkexec", args: [manager.command, ...manager.args] };
}

function currentPlan(): GitInstallPlan {
  return gitInstallPlan(process.platform, process.arch, command => Boolean(resolveCommand(command).path));
}

async function appleToolsInstalled(): Promise<boolean> {
  return run("xcode-select", ["-p"], { timeout: 10_000 }).then(() => true, () => false);
}

async function detectVersion(): Promise<string | undefined> {
  const path = resolveCommand("git").path;
  if (process.platform === "darwin" && path === "/usr/bin/git" && !await appleToolsInstalled()) return undefined;
  return (await commandVersion("git"))?.replace(/^git version /, "");
}

let state: GitRuntimeStatus = { status: "idle", ready: false, supported: false, method: "" };

export async function gitRuntimeStatus(): Promise<GitRuntimeStatus> {
  if (state.status === "installing") return { ...state };
  const plan = currentPlan();
  const version = await detectVersion();
  state = { ...state, ready: Boolean(version), version, supported: plan.kind !== "manual", method: plan.method };
  return { ...state };
}

async function installPortableGit(plan: Extract<GitInstallPlan, { kind: "download" }>): Promise<void> {
  state.message = "Downloading Git…";
  const archive = await downloadVerified({ url: plan.url, sha256: plan.sha256, maxBytes: DOWNLOAD_MAX_BYTES, timeout: DOWNLOAD_TIMEOUT, label: "Git", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT), redirect: "follow" });
  const destination = minGitFolder(homedir(), process.arch);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const stage = await mkdtemp(join(dirname(destination), ".setup-"));
  try {
    const zip = join(stage, "mingit.zip");
    await writeFile(zip, archive, { mode: 0o600, flag: "wx" });
    state.message = "Installing Git…";
    await mkdir(join(stage, "git"));
    await run("tar", ["-xf", zip, "-C", join(stage, "git")], { timeout: EXTRACT_TIMEOUT, windowsHide: true });
    await rm(destination, { recursive: true, force: true });
    await rename(join(stage, "git"), destination);
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(logFailure("Removing the Git download folder", stage));
  }
  const commands = minGitCommands(homedir(), process.arch);
  process.env.PATH = [commands, ...(process.env.PATH || "").split(delimiter).filter(entry => entry !== commands)].join(delimiter);
}

async function installAppleTools(): Promise<void> {
  state.message = "Finish the install in Apple's window. Citropy continues when it is done.";
  await run("xcode-select", ["--install"], { timeout: 30_000 }).catch(error => {
    if (!/already installed/i.test(String((error as { stderr?: string }).stderr))) throw error;
  });
  const deadline = Date.now() + APPLE_INSTALLER_WAIT;
  while (!await appleToolsInstalled()) {
    if (Date.now() > deadline) throw new Error("Apple's installer did not finish within 30 minutes. Check again after it completes.");
    await new Promise(resolve => setTimeout(resolve, APPLE_CHECK_INTERVAL));
  }
}

async function installPackage(plan: Extract<GitInstallPlan, { kind: "package" }>): Promise<void> {
  state.message = "Enter your password in the system window to install Git.";
  await run(plan.command, plan.args, { timeout: PACKAGE_INSTALL_TIMEOUT }).catch(error => {
    if (POLKIT_DISMISSED.includes((error as { code?: number }).code!)) throw new Error("The password window was closed, so nothing was installed.");
    if (hasCode(error, "ENOENT")) throw new Error(`Could not start ${plan.command}. Install git with your system's package manager.`);
    throw error;
  });
}

function install(plan: GitInstallPlan): Promise<void> {
  if (plan.kind === "download") return installPortableGit(plan);
  if (plan.kind === "apple") return installAppleTools();
  if (plan.kind === "package") return installPackage(plan);
  throw new Error(plan.method);
}

export function gitRuntimeInstalling(): boolean {
  return state.status === "installing";
}

export function installGitRuntime(): GitRuntimeStatus {
  if (state.status === "installing") throw new Error("Git is already being installed.");
  const plan = currentPlan();
  if (plan.kind === "manual") throw new Error(plan.method);
  state = { ...state, status: "installing", method: plan.method, message: "Starting the Git installation…" };
  void (async () => {
    try {
      await install(plan);
      clearCommandCache();
      const version = await detectVersion();
      if (!version) throw new Error("Git was installed but could not be found. Restart Citropy and check again.");
      state = { ...state, status: "success", ready: true, version, message: "Git is ready." };
    } catch (error) {
      state = { ...state, status: "error", message: (error as Error).message };
    }
  })();
  return { ...state };
}
