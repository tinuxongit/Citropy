import { connect as connectSocket, type Socket } from "node:net";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dataRoot } from "./paths.ts";
import { hasCode, ifMissing, logFailure } from "../shared/expected-errors.mjs";
import { processExists } from "../shared/process-exists.mjs";
import { bus } from "./bus.ts";
import { panelList, closePanel, openPanel } from "./panels.ts";
import { startShell, shellOutput, endShell, shellActivity } from "./shells.ts";
import { appendOutput, exitNotice } from "../shared/terminal.ts";
import type { TerminalEvent, TerminalRequest, TerminalSession } from "../shared/terminal.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 1500;
const RECONNECT_DELAY_MS = 1000;
const START_ATTEMPTS = 80;
const START_RETRY_MS = 100;
const MAX_INBOUND_BYTES = 32 * 1024 * 1024;
const MAX_QUEUED_BYTES = 1024 * 1024;
const MAX_UNIX_SOCKET_PATH_BYTES = 100;
const STALE_LOCK_MS = 10_000;

const key = createHash("sha256").update(dataRoot).digest("hex").slice(0, 24);
const directory = join(tmpdir(), `citropy-terminals-${process.getuid?.() ?? "user"}-${key}`);
const legacyAddress = process.platform === "win32" ? `\\\\.\\pipe\\citropy-terminals-${key}` : join(directory, "service.sock");
const addressFile = join(directory, "address");
const SERVICE_DOWN = ["ENOENT", "ECONNREFUSED", "ENAMETOOLONG"];
const sessions = new Map<string, TerminalSession>();
const blocked = new Map<string, Set<string>>();
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
let connection: Socket | null = null;
let connecting: Promise<void> | null = null;
let reconnect: NodeJS.Timeout | undefined;
let detached = false;
let daemonPid: number | undefined;

export function servicePid(): number | undefined { return daemonPid; }

function receive(event: TerminalEvent): void {
  const session = sessions.get(event.id);
  if (!session) return;
  if (event.type === "data") {
    if (event.offset <= session.offset) return;
    const data = event.data.slice(Math.max(0, session.offset - (event.offset - event.data.length)));
    appendOutput(session, data);
    shellOutput(`terminal:${event.id}`, data, true);
    bus.emit({ t: "term.data", termId: event.id, data, offset: session.offset, sessionId: session.sessionId });
  } else if (event.type === "activity") {
    Object.assign(session, { busy: event.busy, process: event.process });
    shellActivity(`terminal:${event.id}`, event.busy, event.process);
  } else {
    if (!session.running) return;
    session.running = false;
    session.busy = false;
    session.process = undefined;
    session.code = event.code;
    appendOutput(session, exitNotice(event.code));
    endShell(`terminal:${event.id}`, event.code === 0 ? "finished" : "failed");
    bus.emit({ t: "term.exit", termId: event.id, code: event.code, offset: session.offset, sessionId: session.sessionId });
  }
}

function attach(session: TerminalSession, recovered = false): void {
  const previous = sessions.get(session.id);
  sessions.set(session.id, session);
  if (recovered && previous && (previous.output !== session.output || previous.offset !== session.offset || previous.sessionId !== session.sessionId))
    bus.emit({ t: "term.data", termId: session.id, data: session.output, reset: true, offset: session.offset, sessionId: session.sessionId });
  if (session.panel) openPanel(session.panel.projectId, "terminal", session.panel.threadId, session.id);
  const panel = session.panel ?? panelList().find(panel => panel.id === session.id);
  if (panel) {
    startShell({ id: `terminal:${session.id}`, projectId: panel.projectId, threadId: panel.threadId, panelId: panel.id, command: session.command || "", cwd: session.cwd, background: true }, async () => { await close(session.id); closePanel(session.id); });
    shellActivity(`terminal:${session.id}`, session.busy, session.process);
    shellOutput(`terminal:${session.id}`, session.output);
    if (!session.running) endShell(`terminal:${session.id}`, session.code === 0 ? "finished" : "failed");
  }
}

async function startService(): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await writeFile(join(directory, "key"), randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" }); }
  catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
  try { await mkdir(join(directory, "lock"), { mode: 0o700 }); }
  catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
    const pid = Number(await readFile(join(directory, "lock", "pid"), "utf8").catch(ifMissing("")));
    const alive = pid > 0 && processExists(pid);
    const age = Date.now() - (await stat(join(directory, "lock"))).mtimeMs;
    if (alive || (!pid && age < STALE_LOCK_MS)) return;
    await rm(join(directory, "lock"), { recursive: true, force: true });
    return startService();
  }
  let address = legacyAddress;
  if (process.platform !== "win32") {
    const savedAddress = await readSocketAddress();
    if (savedAddress) address = savedAddress;
    else {
      let socketDirectory = await mkdtemp(join(tmpdir(), "ct-"));
      address = join(socketDirectory, "service.sock");
      if (Buffer.byteLength(address) >= MAX_UNIX_SOCKET_PATH_BYTES) {
        await rm(socketDirectory, { recursive: true, force: true });
        socketDirectory = await mkdtemp(join("/tmp", "ct-"));
        address = join(socketDirectory, "service.sock");
      }
      if (Buffer.byteLength(address) >= MAX_UNIX_SOCKET_PATH_BYTES) throw new Error("The terminal service socket path is too long.");
      await writeFile(addressFile, address, { mode: 0o600 });
    }
    await mkdir(dirname(address), { recursive: true, mode: 0o700 });
    await rm(address, { force: true });
  }
  const child = spawn(process.execPath, ["--experimental-strip-types", "--optimize-for-size", fileURLToPath(new URL("./terminal-daemon.ts", import.meta.url)), address, directory], {
    detached: true, stdio: "ignore", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  child.on("error", (error) => {
    console.error("Starting the terminal service failed:", error);
    void rm(join(directory, "lock"), { recursive: true, force: true });
  });
  child.unref();
}

function request<T>(message: TerminalRequest): Promise<T> {
  if (!connection || connection.destroyed) return Promise.reject(new Error("The terminal service is reconnecting."));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("The terminal service did not respond.")); }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    connection!.write(JSON.stringify({ id, ...message }) + "\n");
  });
}

async function readSocketAddress(): Promise<string | undefined> {
  if (process.platform === "win32") return undefined;
  const address = (await readFile(addressFile, "utf8").catch(ifMissing(""))).trim();
  if (!isAbsolute(address) || basename(address) !== "service.sock" || !basename(dirname(address)).startsWith("ct-")) return undefined;
  return address;
}

async function dial(): Promise<void> {
  const savedAddress = await readSocketAddress();
  const addresses = [...new Set([savedAddress, legacyAddress].filter((value): value is string => !!value))];
  let lastError: unknown;
  for (const address of addresses) {
    try { await dialAddress(address); return; }
    catch (error) {
      if (!hasCode(error, ...SERVICE_DOWN)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("The terminal service address is unavailable.");
}

function dialAddress(address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connectSocket(address);
    const timer = setTimeout(() => socket.destroy(new Error("Terminal service connection timed out.")), CONNECT_TIMEOUT_MS);
    socket.once("error", reject);
    socket.once("connect", () => {
      clearTimeout(timer);
      connection = socket;
      let buffer = "";
      let ready = false;
      const waiting: TerminalEvent[] = [];
      let waitingBytes = 0;
      socket.setEncoding("utf8");
      socket.on("data", data => {
        buffer += data;
        if (buffer.length > MAX_INBOUND_BYTES) { socket.destroy(); return; }
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message: { event?: TerminalEvent; id?: string; result?: unknown; error?: string };
          try { message = JSON.parse(line); } catch (error) { socket.destroy(error as Error); return; }
          if (message.event) {
            const event = message.event;
            queueMicrotask(() => {
              if (connection !== socket || socket.destroyed) return;
              if (ready) receive(event);
              else {
                waiting.push(event);
                waitingBytes += event.type === "data" ? event.data.length : 0;
                if (waitingBytes > MAX_QUEUED_BYTES) socket.destroy();
              }
            });
          }
          else if (message.id) {
            const entry = pending.get(message.id);
            if (!entry) continue;
            clearTimeout(entry.timer); pending.delete(message.id);
            if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result);
          }
        }
      });
      socket.on("close", () => {
        if (connection !== socket) return;
        connection = null;
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("The terminal service disconnected.")); }
        pending.clear();
        if (!detached && sessions.size) reconnect = setTimeout(() => { void ensure().catch(logFailure("Reconnecting to the terminal service")); }, RECONNECT_DELAY_MS);
      });
      void readFile(join(directory, "key"), "utf8").then(token => request<TerminalSession[]>({ op: "hello", version: 1, token, activity: true })).then(async entries => {
        if (connection !== socket || socket.destroyed) throw new Error("The terminal service disconnected during recovery.");
        for (const session of entries) attach(session, true);
        ready = true;
        for (const event of waiting) receive(event);
        waiting.length = 0;
        daemonPid = Number(await readFile(join(directory, "lock", "pid"), "utf8").catch(ifMissing("0"))) || undefined;
        for (const [termId, consumers] of blocked) if (consumers.size) await request({ op: "flow", termId, paused: true });
        resolve();
      }).catch(error => { socket.destroy(); reject(error); });
    });
    socket.once("close", () => clearTimeout(timer));
  });
}

async function ensure(spawnService = true): Promise<void> {
  detached = false;
  if (connecting) return connecting;
  if (connection && !connection.destroyed) return;
  connecting = (async () => {
    try { await dial(); return; } catch (error) {
      if (!hasCode(error, ...SERVICE_DOWN)) throw error;
      if (!spawnService) return;
    }
    await startService();
    let lastError: unknown;
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
      await new Promise(resolve => setTimeout(resolve, START_RETRY_MS));
      try { await dial(); return; } catch (error) {
        if (!hasCode(error, ...SERVICE_DOWN)) throw error;
        lastError = error;
      }
    }
    throw new Error("The terminal service could not start. Check that Node and node-pty are installed.", { cause: lastError });
  })().finally(() => { connecting = null; });
  return connecting;
}

export async function restore(): Promise<void> { await ensure(false); }

export async function open(termId: string, cwd: string, cols: number, rows: number, command?: string, env?: Record<string, string>): Promise<void> {
  await ensure();
  const session = await request<TerminalSession>({ op: "open", input: { id: termId, cwd, cols, rows, command, env, panel: panelList().find(panel => panel.id === termId) } });
  attach(session);
  await request({ op: "resize", termId, cols, rows });
}

export function session(termId: string): TerminalSession | undefined { return sessions.get(termId); }

export function read(termId: string): string { return sessions.get(termId)?.output ?? ""; }

export function replay(termId: string, offset?: number, sessionId?: string): { data: string; reset: boolean; offset?: number; sessionId?: string } {
  const current = sessions.get(termId);
  const retained = current?.output ?? "";
  const end = current?.offset;
  if (sessionId && sessionId === current?.sessionId && typeof offset === "number" && Number.isSafeInteger(offset)
    && end !== undefined && offset >= end - retained.length && offset <= end)
    return { data: retained.slice(retained.length - (end - offset)), reset: false, offset: end, sessionId };
  return {
    data: retained,
    reset: true,
    offset: end,
    sessionId: current?.sessionId,
  };
}

export async function write(termId: string, data: string): Promise<void> {
  await ensure();
  await request({ op: "write", termId, data });
}

export async function resize(termId: string, cols: number, rows: number): Promise<void> {
  if (connection) await request({ op: "resize", termId, cols, rows });
}

export function flow(termId: string, client: string, paused: boolean): void {
  const consumers = blocked.get(termId) ?? new Set<string>();
  const wasPaused = consumers.size > 0;
  if (paused) consumers.add(client); else consumers.delete(client);
  if (consumers.size) blocked.set(termId, consumers); else blocked.delete(termId);
  if (connection && wasPaused !== (consumers.size > 0)) void request({ op: "flow", termId, paused: consumers.size > 0 }).catch(logFailure("Pausing terminal output", termId));
}

export function release(client: string): void { for (const id of [...blocked.keys()]) flow(id, client, false); }

export async function close(termId: string): Promise<void> {
  const exists = sessions.has(termId);
  if (exists) { await ensure(false); await request({ op: "close", termId }); }
  sessions.delete(termId); blocked.delete(termId);
  if (exists) endShell(`terminal:${termId}`, "stopped");
}

export async function closeAll(): Promise<void> {
  if (sessions.size) { await ensure(false); await request({ op: "closeAll" }); }
  for (const id of sessions.keys()) endShell(`terminal:${id}`, "stopped");
  sessions.clear(); blocked.clear();
  detach();
}

export function detach(): void {
  detached = true;
  daemonPid = undefined;
  clearTimeout(reconnect);
  connection?.destroy();
  connection = null;
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("The terminal client detached.")); }
  pending.clear();
}

bus.subscribe(event => {
  if (event.t !== "thread.remove" && event.t !== "project.remove") return;
  for (const panel of panelList()) {
    if (panel.kind !== "terminal" || (event.t === "thread.remove" ? panel.threadId !== event.id : panel.projectId !== event.id)) continue;
    void close(panel.id).catch(logFailure("Closing a terminal", panel.id));
    closePanel(panel.id);
  }
});
