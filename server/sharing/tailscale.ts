import type { AddressInfo } from "node:net";
import { canRunAsAdmin } from "../admin-command.ts";
import { writeLog } from "../logs.ts";
import { saveSharingSettings, sharingSettings } from "./devices.ts";
import { createDeviceProxy, type DeviceProxy } from "./proxy.ts";
import {
  allowOperator,
  operatorCommand,
  readStatus,
  serve,
  servedTarget,
  stopServing,
  TailscaleCommandError,
  tailscaleExecutable,
} from "./tailscale-cli.ts";

const SETTINGS = {
  httpsPort: 443,
  recheckIntervalMs: 30_000,
  approvalTimeoutMs: 10 * 60_000,
  downloadUrl: "https://tailscale.com/download",
  dnsSettingsUrl: "https://login.tailscale.com/admin/dns",
};

export interface TailscaleState {
  status: "off" | "connecting" | "approval" | "on" | "problem";
  url?: string;
  message?: string;
  link?: { label: string; url: string };
  command?: string;
  canFix?: boolean;
}

class Problem extends Error {
  readonly details: Omit<TailscaleState, "status" | "message">;

  constructor(message: string, details: Omit<TailscaleState, "status" | "message"> = {}) {
    super(message);
    this.details = details;
  }
}

let state: TailscaleState = { status: "off" };
let proxy: DeviceProxy | undefined;
let attempt: Promise<void> | undefined;
let abort: AbortController | undefined;
let recheck: NodeJS.Timeout | undefined;

function requireExecutable(): string {
  const executable = tailscaleExecutable();
  if (!executable)
    throw new Problem("Tailscale is not installed on this computer.", {
      link: { label: "Download Tailscale", url: SETTINGS.downloadUrl },
    });
  return executable;
}

async function tailnetName(executable: string): Promise<string> {
  const status = await readStatus(executable).catch((error: unknown) => {
    if (error instanceof TailscaleCommandError && !error.accessDenied)
      throw new Problem(
        "Tailscale is not running on this computer. Start it and Citropy connects on its own.",
      );
    throw error;
  });
  if (status.backendState !== "Running")
    throw new Problem(
      "Tailscale is not connected. Open Tailscale and sign in, and Citropy connects on its own.",
    );
  if (!status.dnsName)
    throw new Problem("Turn on MagicDNS for your tailnet so this computer gets a web address.", {
      link: { label: "Open DNS settings", url: SETTINGS.dnsSettingsUrl },
    });
  return status.dnsName;
}

function localTarget(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function listenLocally(): Promise<string> {
  if (!proxy) {
    const created = createDeviceProxy("tailscale");
    const wanted = sharingSettings.tailscalePort ?? 0;
    await new Promise<void>((resolve, reject) => {
      created.server.once("error", (error: NodeJS.ErrnoException) =>
        reject(
          error.code === "EADDRINUSE"
            ? new Problem(
                `Another program is using port ${wanted}, which Citropy shares over Tailscale. Close that program, then turn Tailscale sharing off and on.`,
              )
            : error,
        ),
      );
      created.server.listen(wanted, "127.0.0.1", resolve);
    });
    proxy = created;
    const { port } = created.server.address() as AddressInfo;
    if (sharingSettings.tailscalePort !== port) {
      sharingSettings.tailscalePort = port;
      saveSharingSettings();
    }
  }
  return localTarget(sharingSettings.tailscalePort!);
}

function publicUrl(dnsName: string): string {
  return `https://${dnsName}${SETTINGS.httpsPort === 443 ? "" : `:${SETTINGS.httpsPort}`}/`;
}

async function connect(signal: AbortSignal): Promise<void> {
  const executable = requireExecutable();
  const dnsName = await tailnetName(executable);
  const target = await listenLocally();
  const url = publicUrl(dnsName);
  const mapped = await servedTarget(executable, dnsName, SETTINGS.httpsPort);
  if (mapped && mapped !== target)
    throw new Problem(
      `Tailscale already shares ${mapped} at ${url}. Turn that off to share Citropy there.`,
      { command: `tailscale serve --https=${SETTINGS.httpsPort} off` },
    );
  if (!mapped) {
    if (state.status !== "approval") state = { status: "connecting" };
    await serve(
      executable,
      SETTINGS.httpsPort,
      target,
      SETTINGS.approvalTimeoutMs,
      signal,
      (link) => {
        state = {
          status: "approval",
          message:
            "Your tailnet needs HTTPS turned on. Approve it on the Tailscale page, and Citropy finishes on its own.",
          link: { label: "Turn on HTTPS", url: link },
        };
      },
    );
  }
  state = { status: "on", url };
}

function problemState(error: unknown): TailscaleState {
  if (error instanceof Problem)
    return { status: "problem", message: error.message, ...error.details };
  if (error instanceof TailscaleCommandError && error.accessDenied)
    return {
      status: "problem",
      message: "Tailscale needs your permission before Citropy can share this computer.",
      command: operatorCommand(),
      canFix: canRunAsAdmin,
    };
  const message = error instanceof Error ? error.message : String(error);
  writeLog("error", "sharing", `Tailscale: ${message}`);
  return { status: "problem", message: `Tailscale reported: ${message}` };
}

function refresh(): Promise<void> {
  if (attempt) return attempt;
  const controller = (abort = new AbortController());
  attempt = connect(controller.signal)
    .catch((error: unknown) => {
      if (!controller.signal.aborted) state = problemState(error);
    })
    .finally(() => {
      attempt = undefined;
    });
  return attempt;
}

export function tailscaleState(): TailscaleState {
  return state;
}

export function startTailscale(): void {
  recheck ??= setInterval(() => void refresh(), SETTINGS.recheckIntervalMs);
  recheck.unref();
  if (state.status === "off") state = { status: "connecting" };
  void refresh();
}

function closeLocally(): void {
  clearInterval(recheck);
  recheck = undefined;
  abort?.abort();
  proxy?.close();
  proxy = undefined;
}

export async function stopTailscale(): Promise<void> {
  const wasServing = state.status === "on";
  closeLocally();
  await attempt;
  state = { status: "off" };
  if (!wasServing || !sharingSettings.tailscalePort) return;
  const executable = requireExecutable();
  const dnsName = await tailnetName(executable);
  if (
    (await servedTarget(executable, dnsName, SETTINGS.httpsPort)) ===
    localTarget(sharingSettings.tailscalePort)
  )
    await stopServing(executable, SETTINGS.httpsPort);
}

export async function allowTailscaleOperator(): Promise<void> {
  await allowOperator(requireExecutable());
  await refresh();
}

export function shutDownTailscale(): void {
  closeLocally();
}
