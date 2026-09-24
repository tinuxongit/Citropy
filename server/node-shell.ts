import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

async function shellFiles(bin: string): Promise<{ path: string; content: string }[]> {
  const home = homedir();
  const shell = basename(process.env.SHELL || (process.platform === "darwin" ? "zsh" : "bash"));
  const paths = [bin, join(home, ".local", "bin")];
  if (shell === "fish") return [{
    path: join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "fish", "conf.d", "citropy-node.fish"),
    content: paths.map(path => `if not contains -- ${quote(path)} $PATH; set -gx PATH ${quote(path)} $PATH; end`).join("\n"),
  }];
  const content = paths.map(path => `case ":$PATH:" in *:${quote(path)}:*) ;; *) export PATH=${quote(path)}:"$PATH" ;; esac`).join("\n");
  if (shell === "zsh") {
    const directory = process.env.ZDOTDIR || home;
    return [".zshrc", ".zprofile"].map(file => ({ path: join(directory, file), content }));
  }
  if (shell === "bash") {
    let profile = ".profile";
    for (const candidate of [".bash_profile", ".bash_login"]) {
      if (await access(join(home, candidate)).then(() => true, () => false)) { profile = candidate; break; }
    }
    return [".bashrc", profile].map(file => ({ path: join(home, file), content }));
  }
  if (["sh", "dash", "ksh"].includes(shell)) return [{ path: join(home, ".profile"), content }];
  throw new Error(`Automatic Node.js terminal setup does not support ${shell}. Add ${bin} to your shell's PATH.`);
}

async function windowsPath(bin: string, install: boolean): Promise<boolean> {
  const script = `$ErrorActionPreference = 'Stop'; $current = [Environment]::GetEnvironmentVariable('Path', 'User'); $entries = @($current -split ';' | Where-Object { $_ }); $required = @($env:CITROPY_NODE_BIN, (Join-Path $env:APPDATA 'npm')); $missing = @($required | Where-Object { $entries -notcontains $_ }); ${install ? "if ($missing.Count) { [Environment]::SetEnvironmentVariable('Path', (($missing + $entries) -join ';'), 'User') }; Write-Output 'ready'" : "if ($missing.Count -eq 0) { Write-Output 'ready' }"}`;
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    timeout: 15000, windowsHide: true, env: { ...process.env, CITROPY_NODE_BIN: bin },
  });
  return stdout.trim() === "ready";
}

export async function nodeShellConfigured(bin: string): Promise<boolean> {
  if (process.platform === "win32") return windowsPath(bin, false);
  const files = await shellFiles(bin);
  for (const file of files) {
    const content = await readFile(file.path, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    if (!content.includes(file.content)) return false;
  }
  return true;
}

export async function configureNodeShell(bin: string): Promise<void> {
  if (process.platform === "win32") { await windowsPath(bin, true); return; }
  for (const file of await shellFiles(bin)) {
    const content = await readFile(file.path, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    if (content.includes(file.content)) continue;
    await mkdir(dirname(file.path), { recursive: true });
    await appendFile(file.path, `\n${file.content}\n`, { mode: 0o600 });
  }
}
