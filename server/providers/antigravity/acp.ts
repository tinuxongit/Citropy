import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { rm } from "node:fs/promises";
import { Writable, type Readable } from "node:stream";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError, type Client, type InitializeResponse } from "@agentclientprotocol/sdk";
import { logFailure } from "../../../shared/expected-errors.mjs";
import { onLines } from "../../lines.ts";
import { CLIENT_INFO } from "../control.ts";
import { stopProcess } from "../process.ts";
import { antigravityInstallation } from "./install.ts";
import { antigravityProfile, AUTH_URL_MARKER, launchEnvironment, prepareProfile, temporaryFolder } from "./profile.ts";

const SETTINGS = {
  initializeTimeoutMs: 180_000,
  maxLineCharacters: 16 * 1024 * 1024,
  maxAuthUrlCharacters: 16_384,
  stderrTailCharacters: 4_000,
};
const AUTH_PREFIX = "Open the following link to authenticate the ACP server: ";
const AUTH_REQUIRED_CODE = -32000;
export const SIGN_IN_METHOD = "oauth-personal";
export const SIGN_IN_REQUIRED = "Sign in to Antigravity in Settings > Providers before you continue.";

export const idleClient: Client = {
  requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
  sessionUpdate: async () => {},
};

export interface AuthorizationRequest {
  url: string;
  redirectUri: string;
  state: string;
}

export function parseAuthorizationUrl(text: string): AuthorizationRequest {
  const invalid = new Error("Antigravity returned an invalid Google sign-in link.");
  if (text.length > SETTINGS.maxAuthUrlCharacters || /\s/.test(text) || !URL.canParse(text)) throw invalid;
  const url = new URL(text);
  const single = (name: string) => url.searchParams.getAll(name).length === 1 ? url.searchParams.get(name) : null;
  const state = single("state");
  const redirectUri = single("redirect_uri");
  const port = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/$/.exec(redirectUri ?? "")?.[1];
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash
    || single("response_type") !== "code" || !state || state.length > 512 || /\s/.test(state)
    || !port || Number(port) < 1024 || Number(port) > 65535) throw invalid;
  return { url: text, redirectUri: redirectUri!, state };
}

export function isSignInRequired(error: unknown): boolean {
  return error instanceof RequestError && error.code === AUTH_REQUIRED_CODE;
}

function protocolLines(stdout: Readable, onAuthorizationText: (text: string) => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let pending = "";
  return new ReadableStream({
    start(controller) {
      stdout.setEncoding("utf8");
      stdout.on("data", (chunk: string) => {
        pending += chunk;
        for (let index = pending.indexOf("\n"); index !== -1; index = pending.indexOf("\n")) {
          const line = pending.slice(0, index + 1);
          pending = pending.slice(index + 1);
          if (line.startsWith(AUTH_PREFIX)) onAuthorizationText(line.slice(AUTH_PREFIX.length).trim());
          else controller.enqueue(encoder.encode(line));
        }
        if (pending.length > SETTINGS.maxLineCharacters) {
          controller.error(new Error("Antigravity sent a protocol line that is too large."));
          stdout.destroy();
        }
      });
      stdout.once("end", () => {
        if (pending) controller.enqueue(encoder.encode(pending));
        controller.close();
      });
      stdout.once("error", error => controller.error(error));
    },
  });
}

export interface AgentOptions {
  instanceId?: string;
  environment?: Record<string, string>;
  cwd: string;
  client: Client;
  onAuthorization(request: AuthorizationRequest): void;
  onFailure(error: Error): void;
}

export interface Agent {
  connection: ClientSideConnection;
  initialized: InitializeResponse;
  child: ChildProcessWithoutNullStreams;
  stderr(): string;
  stop(): void;
}

export async function startAgent(options: AgentOptions): Promise<Agent> {
  const installation = await antigravityInstallation();
  if (!installation) throw new Error("Install Antigravity in Settings > Providers first.");
  const profile = antigravityProfile(options.instanceId);
  await prepareProfile(profile);
  const temp = await temporaryFolder();
  const child = spawn(installation.executable, process.platform === "linux" ? ["--uid="] : [], {
    cwd: options.cwd,
    env: launchEnvironment(installation, profile, temp, options.environment),
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  child.once("close", () => void rm(temp, { recursive: true, force: true }).catch(logFailure("Removing Antigravity's temporary folder", temp)));
  const authorization = (text: string) => {
    try { options.onAuthorization(parseAuthorizationUrl(text)); }
    catch (error) { options.onFailure(error as Error); }
  };
  let stderr = "";
  onLines(child.stderr, line => {
    if (line.startsWith(AUTH_URL_MARKER)) authorization(JSON.parse(line.slice(AUTH_URL_MARKER.length)));
    else if (line.startsWith(AUTH_PREFIX)) authorization(line.slice(AUTH_PREFIX.length));
    else stderr = `${stderr}${line}\n`.slice(-SETTINGS.stderrTailCharacters);
  });
  child.once("error", error => options.onFailure(error));
  child.stdin.on("error", error => options.onFailure(error));
  const stop = () => {
    child.stdin.end();
    stopProcess(child, true);
  };
  const connection = new ClientSideConnection(() => options.client, ndJsonStream(Writable.toWeb(child.stdin), protocolLines(child.stdout, authorization)));
  let timer: NodeJS.Timeout | undefined;
  try {
    const initialized = await Promise.race([
      connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: CLIENT_INFO,
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Antigravity did not start in time.")), SETTINGS.initializeTimeoutMs); }),
    ]);
    return { connection, initialized, child, stderr: () => stderr.trim(), stop };
  } catch (error) {
    stop();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
