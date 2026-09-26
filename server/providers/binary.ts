import { execFile, spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, posix, win32 } from "node:path";

/**
 * Resolve a provider CLI name (for example `cursor-agent`) to something `spawn` can run on this
 * platform. On Linux and macOS this is the bare name. On Windows the CLIs are `.ps1` / `.cmd`
 * launchers that Node cannot spawn directly, so the result carries the interpreter and arguments.
 *
 * Also consulted for GUI launches where PATH is minimal (~/.local/bin, ~/.opencode/bin, Homebrew).
 */
export interface ResolvedCommand {
  /** Executable to hand to `spawn`. */
  file: string;
  /** Arguments to put before the caller's own arguments. */
  prefix: string[];
  /** Where the CLI was found, for update planning and diagnostics. */
  path?: string;
  /**
   * `.cmd`/`.bat` launchers go through `cmd.exe /d /s /c "<command line>"`. cmd.exe parses that
   * line itself, so the caller must build one verbatim string instead of letting Node quote each
   * argument (see `invocation`).
   */
  shell?: "cmd";
}

/** The exact `spawn`/`execFile` call for a resolved command plus the caller's arguments. */
export function invocation(resolved: ResolvedCommand, args: string[]): { file: string; args: string[]; verbatim: boolean } {
  if (resolved.shell !== "cmd") return { file: resolved.file, args: [...resolved.prefix, ...args], verbatim: false };
  // Ported from cross-spawn: escape for cmd.exe, which strips the outer quotes because of /s.
  const command = resolved.path!.replace(/([()\][%!^"`<>&|;, *?])/g, "^$1");
  const escaped = args.map((argument) => {
    let value = `"${argument.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\*)$/, "$1$1")}"`;
    value = value.replace(/([()\][%!^"`<>&|;, *?])/g, "^$1");
    return value;
  });
  return { file: resolved.file, args: ["/d", "/s", "/c", `"${[command, ...escaped].join(" ")}"`], verbatim: true };
}

export interface ResolveInOptions {
  platform: NodeJS.Platform;
  dirs: string[];
  pathext?: string;
  exists: (path: string) => boolean;
}

const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
const CACHE_TTL = 30_000;
const cache = new Map<string, { at: number; value: ResolvedCommand }>();
const VERSION_TTL = 15 * 60_000;
const versions = new Map<string, { identity: string; at: number; version: string }>();

export function clearCommandCache(): void {
  cache.clear();
  versions.clear();
}

function findInDirs(name: string, dirs: string[], exists: (path: string) => boolean, win: boolean): string | undefined {
  for (const dir of dirs) {
    const candidate = (win ? win32 : posix).join(dir, name);
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** Pure resolution against an explicit platform, directory list and existence check. */
export function resolveIn(binary: string, options: ResolveInOptions): ResolvedCommand {
  const { platform, dirs, exists } = options;
  if ((platform === "win32" ? win32.isAbsolute(binary) : posix.isAbsolute(binary)) && exists(binary)) {
    if (platform === "win32" && /\.(cmd|bat)$/i.test(binary)) return { file: process.env.ComSpec ?? "cmd.exe", prefix: [], path: binary, shell: "cmd" };
    if (platform === "win32" && /\.ps1$/i.test(binary)) return { file: "powershell.exe", prefix: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", binary], path: binary };
    return { file: binary, prefix: [], path: binary };
  }
  if (platform !== "win32") {
    const path = findInDirs(binary, dirs, exists, false);
    return path ? { file: binary, prefix: [], path } : { file: binary, prefix: [] };
  }
  const extensions = (options.pathext ?? DEFAULT_PATHEXT)
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  const names = binary === "cursor-agent" ? [binary, "agent"] : [binary];
  let powershell: string | undefined;
  for (const dir of dirs) {
    for (const name of names) {
      for (const extension of [...extensions, ".ps1"]) {
        const candidate = win32.join(dir, `${name}${extension}`);
        if (!exists(candidate)) continue;
        const lower = candidate.toLowerCase();
        if (lower.endsWith(".ps1")) {
          powershell ??= candidate;
          continue;
        }
        if (lower.endsWith(".cmd") || lower.endsWith(".bat"))
          return { file: process.env.ComSpec ?? "cmd.exe", prefix: [], path: candidate, shell: "cmd" };
        if (lower.endsWith(".exe") || lower.endsWith(".com"))
          return { file: candidate, prefix: [], path: candidate };
      }
    }
  }
  if (powershell) {
    const file = findInDirs("pwsh.exe", dirs, exists, true) ? "pwsh.exe" : "powershell.exe";
    return { file, prefix: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", powershell], path: powershell };
  }
  return { file: binary, prefix: [] };
}

function pathDirectories(): string[] {
  return (process.env.PATH ?? "").split(delimiter).filter(Boolean);
}

function windowsDirectories(): string[] {
  const local = process.env.LOCALAPPDATA;
  const dirs: string[] = [];
  if (local) dirs.push(win32.join(local, "cursor-agent"));
  if (process.env.APPDATA) dirs.push(win32.join(process.env.APPDATA, "npm"));
  if (local) dirs.push(win32.join(local, "Programs", "opencode"));
  dirs.push(win32.join(homedir(), ".opencode", "bin"));
  return dirs;
}

export function resolveCommand(binary: string): ResolvedCommand {
  const cached = cache.get(binary);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  const dirs = process.platform === "win32" ? [...pathDirectories(), ...windowsDirectories()] : pathDirectories();
  const value = resolveIn(binary, {
    platform: process.platform,
    dirs,
    ...(process.env.PATHEXT ? { pathext: process.env.PATHEXT } : {}),
    exists: existsSync,
  });
  cache.set(binary, { at: Date.now(), value });
  return value;
}

/** `spawn` a provider CLI by name using `resolveCommand`. */
export function spawnCommand(
  binary: string,
  args: string[],
  options: SpawnOptions,
): ChildProcessWithoutNullStreams {
  const call = invocation(resolveCommand(binary), args);
  return spawn(call.file, call.args, { ...options, windowsHide: true, windowsVerbatimArguments: call.verbatim }) as ChildProcessWithoutNullStreams;
}

/** The installed file behind a command, which changes whenever the CLI is installed, updated or removed. */
export function commandIdentity(binary: string): string | undefined {
  const path = resolveCommand(binary).path;
  if (!path) return undefined;
  try {
    const target = realpathSync(path);
    const { ino, size, mtimeMs, ctimeMs } = statSync(target);
    return `${target}:${ino}:${size}:${mtimeMs}:${ctimeMs}`;
  } catch {
    return undefined;
  }
}

/** Read the first non-empty version line from `binary --version`, or undefined if it fails. */
export function commandVersion(binary: string, timeoutMs = 8000, environment?: Record<string, string>): Promise<string | undefined> {
  const key = `${binary}\0${JSON.stringify(environment ?? {})}`;
  const identity = commandIdentity(binary);
  const cached = versions.get(key);
  if (identity && cached?.identity === identity && Date.now() - cached.at < VERSION_TTL) return Promise.resolve(cached.version);
  const call = invocation(resolveCommand(binary), ["--version"]);
  return new Promise((resolve) => {
    execFile(
      call.file,
      call.args,
      { timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: call.verbatim, env: { ...process.env, ...environment } },
      (error, stdout, stderr) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const version = (stdout || stderr).split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        if (identity && version) versions.set(key, { identity, at: Date.now(), version });
        resolve(version);
      },
    );
  });
}
