import { spawnMspConnection, type Connection, type SpawnedMspConnection } from "@muse-code/sdk";
import type { PermissionMode } from "../../../shared/protocol.ts";
import { invocation, resolveCommand } from "../binary.ts";
import { CLIENT_INFO } from "../control.ts";
import type { ProviderLaunch } from "../types.ts";

const STARTUP_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = 1;
const STDERR_LINES = 20;
const CLIENT_TITLE = "Citropy";
const SESSION_MCP = "sessionMcp";

export const MUSE_BINARY = "muse";
export const MUSE_PROVIDER = "meta";

export type HostAccess = "workspace" | "unsandboxed" | "readOnly";

const SERVE_ARGS: Record<HostAccess, string[]> = {
  workspace: ["--trust-workspace"],
  unsandboxed: ["--trust-workspace", "--disable-sandbox"],
  readOnly: ["--trust-workspace", "--disable-shell", "--disable-write"],
};

export function hostAccess(permissionMode: PermissionMode): HostAccess {
  return permissionMode === "bypass" ? "unsandboxed" : permissionMode === "plan" ? "readOnly" : "workspace";
}

export const NO_AUTO_UPDATE = { MUSE_NO_AUTO_UPDATE: "1" };

export function unreadable(error: Error): string {
  return `Muse Code sent a message Citropy could not read. ${error.message}`;
}

export function museEnvironment(launch: ProviderLaunch = {}): NodeJS.ProcessEnv {
  return { ...process.env, ...launch.environment, ...NO_AUTO_UPDATE };
}

export interface HostOptions {
  launch?: ProviderLaunch;
  cwd: string;
  access: HostAccess;
  sessionLog?: boolean;
  startupTimeoutMs?: number;
}

export class MuseHost {
  readonly #spawned: SpawnedMspConnection;
  readonly #stderr: () => readonly string[];
  #closing: Promise<void> | undefined;

  private constructor(spawned: SpawnedMspConnection, stderr: () => readonly string[]) {
    this.#spawned = spawned;
    this.#stderr = stderr;
  }

  static async start(options: HostOptions): Promise<MuseHost> {
    const call = invocation(resolveCommand(options.launch?.binary ?? MUSE_BINARY), [
      "serve",
      ...SERVE_ARGS[options.access],
      ...(options.sessionLog === false ? ["--no-session-log"] : []),
    ]);
    const handshake = spawnMspConnection({ command: call.file, args: call.args, cwd: options.cwd, env: museEnvironment(options.launch), shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS });
    const stderr = () => handshake.child.stderrTail;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Muse Code did not start in time.")), options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS);
    });
    try {
      const spawned = await Promise.race([handshake.initialize({
        clientInfo: { name: CLIENT_INFO.name, title: CLIENT_TITLE, version: CLIENT_INFO.version },
        capabilities: { requestedCapabilities: options.access === "readOnly" ? [] : [SESSION_MCP] },
      }), timeout]);
      if (spawned.initializeResult.schema?.version !== PROTOCOL_VERSION) throw new Error(`Muse Code speaks protocol version ${spawned.initializeResult.schema?.version}, but Citropy supports version ${PROTOCOL_VERSION}. Update Citropy or Muse Code.`);
      return new MuseHost(spawned, stderr);
    } catch (error) {
      await handshake.close();
      const tail = stderr().slice(-STDERR_LINES).join("\n").trim();
      throw new Error(`Muse Code could not start: ${(error as Error).message}${tail ? `\n${tail}` : ""}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  get connection(): Connection {
    return this.#spawned.connection;
  }

  get exited(): SpawnedMspConnection["exited"] {
    return this.#spawned.exited;
  }

  get mcp(): boolean {
    return this.#spawned.initializeResult.grantedCapabilities?.includes(SESSION_MCP) ?? false;
  }

  stderr(): string {
    return this.#stderr().slice(-STDERR_LINES).join("\n").trim();
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.#timed(method, this.connection.request(method, params)) as Promise<T>;
  }

  command<T>(method: string, params: Record<string, unknown>, options: { commandId?: string; retry?: boolean } = {}): Promise<T> {
    return this.#timed(method, this.connection.command(method, params, {
      ...(options.commandId ? { commandId: options.commandId } : {}),
      ...(options.retry ? {} : { maxAttempts: 1 }),
    })) as Promise<T>;
  }

  close(): Promise<void> {
    return this.#closing ??= this.#spawned.close().then(() => undefined);
  }

  async #timed<T>(method: string, pending: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Muse Code did not answer ${method} in time.`)), COMMAND_TIMEOUT_MS);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }
}
