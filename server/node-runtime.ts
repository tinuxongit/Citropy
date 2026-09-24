import { configureNodeShell, nodeShellConfigured } from "./node-shell.ts";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { downloadNodeArchive, nodeArchiveName, nodeChecksums, nodeVersion } from "../shared/node-runtime.mjs";
import type { NodeRuntimeStatus } from "../shared/runtime-downloads.ts";
import { clearCommandCache, commandVersion } from "./providers/binary.ts";

const run = promisify(execFile);
const platform = `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
const packageName = `node-v${nodeVersion}-${platform}`;
let state: NodeRuntimeStatus = {
  status: "idle",
  ready: false,
  supported: Object.hasOwn(nodeChecksums, platform),
  installVersion: nodeVersion,
};

function compatible(version?: string): boolean {
  const match = /^v?(\d+)\.(\d+)\./.exec(version || "");
  return Boolean(match && (Number(match[1]) > 22 || Number(match[1]) === 22 && Number(match[2]) >= 18));
}

export function nodeRuntimeInstalling(): boolean {
  return state.status === "installing";
}

export async function nodeRuntimeStatus(): Promise<NodeRuntimeStatus> {
  if (state.status === "installing") return { ...state };
  const [version, npmVersion] = await Promise.all([commandVersion("node"), commandVersion("npm")]);
  const destination = join(homedir(), ".citropy", "runtimes", packageName);
  const managed = await verify(destination).then(() => true, () => false);
  const shellReady = !managed || await nodeShellConfigured(process.platform === "win32" ? destination : join(destination, "bin")).catch(() => false);
  state = { ...state, shellReady, version, npmVersion, ready: compatible(version) && Boolean(npmVersion) };
  return { ...state };
}

async function verify(directory: string): Promise<void> {
  const windows = process.platform === "win32";
  const node = join(directory, windows ? "node.exe" : "bin/node");
  const npm = join(directory, windows ? "node_modules" : "lib/node_modules", "npm/bin/npm-cli.js");
  const options = { timeout: 15000, windowsHide: true };
  const { stdout } = await run(node, ["--version"], options);
  if (!compatible(stdout.trim())) throw new Error("The downloaded Node.js version is not compatible.");
  await run(node, [npm, "--version"], options);
}

export function installNodeRuntime(): NodeRuntimeStatus {
  if (state.status === "installing") throw new Error("Node.js is already being installed.");
  if (!state.supported) throw new Error("Automatic Node.js installation supports Linux, macOS, and Windows on x64 or ARM64.");
  state = { ...state, status: "installing", message: "Checking Node.js and npm…" };
  void (async () => {
    let stage: string | undefined;
    try {
      const [version, npmVersion] = await Promise.all([commandVersion("node"), commandVersion("npm")]);
      const root = join(homedir(), ".citropy", "runtimes");
      const destination = join(root, packageName);
      if (!compatible(version) || !npmVersion) {
        const cached = await verify(destination).then(() => true, () => false);
        if (!cached) {
          state.message = "Downloading Node.js and npm…";
          const archive = await downloadNodeArchive(platform, AbortSignal.timeout(180000));
          await mkdir(root, { recursive: true, mode: 0o700 });
          stage = await mkdtemp(join(root, ".setup-"));
          const path = join(stage, nodeArchiveName(platform));
          await writeFile(path, archive, { mode: 0o600, flag: "wx" });
          state.message = "Installing Node.js and npm…";
          await run("tar", ["-xf", path, "-C", stage], { timeout: 60000, windowsHide: true });
          await verify(join(stage, packageName));
          await rename(join(stage, packageName), destination).catch(async error => {
            if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
            await verify(destination);
          });
        }
        const bin = process.platform === "win32" ? destination : join(destination, "bin");
        process.env.PATH = [bin, ...(process.env.PATH || "").split(delimiter).filter(entry => entry !== bin)].join(delimiter);
      }
      if (await verify(destination).then(() => true, () => false)) {
        state.message = "Configuring Node.js for terminals…";
        await configureNodeShell(process.platform === "win32" ? destination : join(destination, "bin"));
      }
      clearCommandCache();
      const [installedNode, installedNpm] = await Promise.all([commandVersion("node"), commandVersion("npm")]);
      if (!compatible(installedNode) || !installedNpm)
        throw new Error("Node.js was installed but could not be detected. Restart Citropy and check again.");
      state = { ...state, status: "success", ready: true, shellReady: true, version: installedNode, npmVersion: installedNpm, message: "Node.js and npm are ready. Open a new terminal to use them outside Citropy." };
    } catch (error) {
      state = { ...state, status: "error", message: (error as Error).message };
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
    }
  })();
  return { ...state };
}
