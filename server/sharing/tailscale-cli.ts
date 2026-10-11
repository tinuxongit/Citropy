import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { resolveCommand } from "../providers/binary.ts";
import { runAsAdmin } from "../admin-command.ts";

const SETTINGS = {
  commandTimeoutMs: 15_000,
  macAppExecutable: "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
};

const approvalLink = /https:\/\/login\.tailscale\.com\/\S+/;

export class TailscaleCommandError extends Error {
  readonly accessDenied: boolean;

  constructor(output: string) {
    super(output || "Tailscale did not respond.");
    this.accessDenied = /access denied/i.test(output);
  }
}

export interface TailscaleStatus {
  backendState: string;
  dnsName?: string;
}

export function tailscaleExecutable(): string | undefined {
  const resolved = resolveCommand("tailscale");
  if (resolved.path) return resolved.path;
  if (process.platform === "darwin" && existsSync(SETTINGS.macAppExecutable)) return SETTINGS.macAppExecutable;
  return undefined;
}

function run(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { timeout: SETTINGS.commandTimeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new TailscaleCommandError(`${stderr}${stdout}`.trim() || error.message));
      else resolve(stdout);
    });
  });
}

export async function readStatus(executable: string): Promise<TailscaleStatus> {
  const status = JSON.parse(await run(executable, ["status", "--json"])) as { BackendState: string; Self?: { DNSName?: string } };
  const dnsName = status.Self?.DNSName?.replace(/\.$/, "");
  return { backendState: status.BackendState, ...(dnsName ? { dnsName } : {}) };
}

export async function servedTarget(executable: string, dnsName: string, httpsPort: number): Promise<string | undefined> {
  const config = JSON.parse(await run(executable, ["serve", "status", "--json"])) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> } | null;
  return config?.Web?.[`${dnsName}:${httpsPort}`]?.Handlers?.["/"]?.Proxy;
}

export function serve(executable: string, httpsPort: number, target: string, timeoutMs: number, signal: AbortSignal, onApprovalLink: (url: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["serve", "--bg", `--https=${httpsPort}`, target], { stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, signal, windowsHide: true });
    let output = "";
    let reported: string | undefined;
    const collect = (chunk: Buffer) => {
      output += chunk;
      const link = approvalLink.exec(output.slice(0, output.lastIndexOf("\n") + 1))?.[0];
      if (link && link !== reported) onApprovalLink((reported = link));
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("exit", (code, exitSignal) => {
      if (code === 0) resolve();
      else if (exitSignal) reject(new TailscaleCommandError("Tailscale did not finish setting up HTTPS in time."));
      else reject(new TailscaleCommandError(output.trim()));
    });
  });
}

export async function stopServing(executable: string, httpsPort: number): Promise<void> {
  await run(executable, ["serve", `--https=${httpsPort}`, "off"]);
}

export function operatorCommand(): string {
  return `sudo tailscale set --operator=${userInfo().username}`;
}

export function allowOperator(executable: string): Promise<void> {
  return runAsAdmin([executable, "set", `--operator=${userInfo().username}`], "Tailscale permission change");
}
