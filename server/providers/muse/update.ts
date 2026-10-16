import { execFile } from "node:child_process";
import { chmod, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ifMissing } from "../../../shared/expected-errors.mjs";
import { MUSE_BINARY } from "./host.ts";

const SETTINGS = {
  launcherMaxBytes: 128 * 1024,
  fetchTimeoutMs: 30_000,
  installTimeoutMs: 10 * 60_000,
  outputMaxBytes: 1024 * 1024,
};

const LAUNCHER_URL = "https://api.meta.ai/muse-launcher.sh";
const CHANNEL_URL = "https://api.meta.ai/muse-code/channels/";
const CHANNELS = ["muse-stable", "muse-canary"];
const DEFAULT_CHANNEL = "muse-stable";
const LAUNCHER_SHEBANG = "#!/usr/bin/env bash";
const LAUNCHER_MARKER = "muse-code/launcher-";
const SUPPORTED_PLATFORMS = ["linux", "darwin"];

export const MUSE_UPDATE_METHOD = "Muse Code launcher";
export const MUSE_INSTALL_METHOD = "Download from Meta";
export const MUSE_UPDATE_ARGS = ["--version"];
export const MUSE_UPDATE_ENVIRONMENT = {
  MUSE_NO_AUTO_UPDATE: "0",
  MUSE_SYNC_UPDATE: "1",
  MUSE_UPDATE_INTERVAL_SECONDS: "0",
  MUSE_LOGIN: "0",
};
export const MUSE_INSTALL_DIRECTORY = join(homedir(), ".local", "bin");

const run = promisify(execFile);

export function museInstallable(): boolean {
  return SUPPORTED_PLATFORMS.includes(process.platform);
}

function isLauncher(script: string): boolean {
  return script.startsWith(LAUNCHER_SHEBANG) && script.includes(LAUNCHER_MARKER);
}

export async function isMuseLauncher(path: string): Promise<boolean> {
  const file = await open(path, "r").catch(ifMissing(undefined));
  if (!file) return false;
  try {
    const buffer = Buffer.alloc(SETTINGS.launcherMaxBytes);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return isLauncher(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await file.close();
  }
}

function channel(): string {
  const name = process.env.MUSE_CHANNEL || DEFAULT_CHANNEL;
  if (!CHANNELS.includes(name)) throw new Error(`Muse Code has no release channel named ${name}.`);
  return name;
}

export async function latestMuseVersion(): Promise<string | undefined> {
  const response = await fetch(`${CHANNEL_URL}${channel()}`, {
    signal: AbortSignal.timeout(SETTINGS.fetchTimeoutMs),
  });
  if (!response.ok)
    throw new Error(`Checking the latest Muse Code version failed (${response.status}).`);
  return ((await response.json()) as { version?: string }).version;
}

export async function installMuse(progress: (message: string) => void): Promise<void> {
  progress("Downloading the Muse Code launcher…");
  const response = await fetch(LAUNCHER_URL, {
    signal: AbortSignal.timeout(SETTINGS.fetchTimeoutMs),
  });
  if (!response.ok)
    throw new Error(
      `Could not download the Muse Code launcher (${response.status}). Check this computer's internet connection and retry.`,
    );
  const script = await response.text();
  if (script.length > SETTINGS.launcherMaxBytes || !isLauncher(script))
    throw new Error("The Muse Code launcher download was invalid. Nothing was installed.");
  await mkdir(MUSE_INSTALL_DIRECTORY, { recursive: true });
  const launcher = join(MUSE_INSTALL_DIRECTORY, MUSE_BINARY);
  const staged = `${launcher}.citropy-${process.pid}`;
  try {
    await writeFile(staged, script, { mode: 0o700, flag: "wx" });
    await chmod(staged, 0o755);
    await rename(staged, launcher);
  } finally {
    await rm(staged, { force: true });
  }
  progress("Installing Muse Code…");
  try {
    await run(launcher, [], {
      cwd: homedir(),
      timeout: SETTINGS.installTimeoutMs,
      maxBuffer: SETTINGS.outputMaxBytes,
      env: { ...process.env, MUSE_LAUNCHER_INSTALL: "1", MUSE_LOGIN: "0" },
    });
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "").trim();
    throw new Error(stderr || (error as Error).message, { cause: error });
  }
}
