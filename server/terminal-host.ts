import { spawn, type IPty } from "node-pty";
import { randomUUID } from "node:crypto";
import { stopProcess, waitForStoppedProcesses } from "./providers/process.ts";
import { terminalProcesses } from "./terminal-processes.ts";
import { appendOutput, exitNotice } from "../shared/terminal.ts";
import type { TerminalEvent, TerminalOpenInput, TerminalSession } from "../shared/terminal.ts";

const MAX_TERMINALS = 64;
const MAX_ID_LENGTH = 200;
const MAX_INPUT_LENGTH = 128 * 1024;
const MIN_COLS = 20;
const MAX_COLS = 1000;
const MIN_ROWS = 5;
const MAX_ROWS = 1000;
const FLUSH_DELAY_MS = 16;
const FLUSH_CHUNK = 16_384;
const PAUSE_ABOVE = 65_536;
const RESUME_BELOW = 32_768;
const ACTIVITY_POLL_MS = 1000;
const ACTIVITY_POLL_MAX_MS = 60_000;
const ACTIVITY_MAX_FAILURES = 6;

function clampSize(cols: number, rows: number): { cols: number; rows: number } {
  return { cols: Math.max(MIN_COLS, Math.min(cols, MAX_COLS)), rows: Math.max(MIN_ROWS, Math.min(rows, MAX_ROWS)) };
}

export class TerminalHost {
  #sessions = new Map<string, TerminalSession & { pty?: IPty; pending: string; timer?: NodeJS.Timeout; blocked: Set<string> }>();
  #poll: NodeJS.Timeout | undefined;
  #polling = false;
  #observeActivity = true;
  #failures = 0;
  #emit: (event: TerminalEvent) => void;

  constructor(emit: (event: TerminalEvent) => void) { this.#emit = emit; }

  observeActivity(active: boolean): void {
    this.#observeActivity = active;
    if (active) this.#scheduleActivity();
    else { clearTimeout(this.#poll); this.#poll = undefined; }
  }

  #scheduleActivity(): void {
    if (!this.#observeActivity || this.#poll || this.#polling || ![...this.#sessions.values()].some(session => session.pty)) return;
    this.#poll = setTimeout(() => { this.#poll = undefined; void this.#checkActivity(); }, Math.min(ACTIVITY_POLL_MS * 2 ** this.#failures, ACTIVITY_POLL_MAX_MS));
    this.#poll.unref();
  }

  async #checkActivity(): Promise<void> {
    this.#polling = true;
    const sessions = [...this.#sessions.values()].filter(session => session.pty);
    try {
      const processes = await terminalProcesses();
      const pids = new Set(processes.map(entry => entry.pid));
      const children = new Map<number, string>();
      for (const process of processes) if (!children.has(process.parent)) children.set(process.parent, process.name);
      for (const session of sessions) {
        if (!session.pty || this.#sessions.get(session.id) !== session) continue;
        const child = children.get(session.pty.pid);
        const busy = pids.has(session.pty.pid) ? Boolean(child || session.command) : undefined;
        const name = child?.split(/[\\/]/).at(-1);
        if (session.busy === busy && session.process === name) continue;
        Object.assign(session, { busy, process: name });
        this.#emit({ type: "activity", id: session.id, busy, process: name });
      }
      this.#failures = 0;
    } catch (error) {
      if (!this.#failures) console.error("Checking terminal activity failed:", error);
      this.#failures = Math.min(this.#failures + 1, ACTIVITY_MAX_FAILURES);
      for (const session of sessions) {
        if (!session.pty || this.#sessions.get(session.id) !== session || session.busy === undefined) continue;
        Object.assign(session, { busy: undefined, process: undefined });
        this.#emit({ type: "activity", id: session.id });
      }
    } finally {
      this.#polling = false;
      this.#scheduleActivity();
    }
  }

  list(): TerminalSession[] {
    return [...this.#sessions.values()].map(({ pty, pending, timer, blocked, ...session }) => ({ ...session }));
  }

  open(input: TerminalOpenInput): TerminalSession {
    const existing = this.#sessions.get(input.id);
    if (existing) {
      if (existing.cwd !== input.cwd) throw new Error("Terminal belongs to another workspace.");
      return this.list().find(session => session.id === input.id)!;
    }
    if (!input.id || input.id.length > MAX_ID_LENGTH || !input.cwd || !Number.isFinite(input.cols) || !Number.isFinite(input.rows)) throw new Error("Invalid terminal options.");
    if (this.#sessions.size >= MAX_TERMINALS) throw new Error(`Close an existing terminal before opening more than ${MAX_TERMINALS} terminals.`);
    const program = process.platform === "win32" ? process.env.COMSPEC ?? "powershell.exe" : process.env.SHELL ?? "/bin/bash";
    const args = input.command ? process.platform === "win32" ? /cmd\.exe$/i.test(program) ? ["/d", "/s", "/c", input.command] : ["-NoProfile", "-Command", input.command] : ["-c", input.command] : process.platform === "win32" ? [] : ["-l"];
    const env = { ...process.env, ...input.env, TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "Citropy", CLICOLOR: "1" };
    for (const key of ["NO_COLOR", "FORCE_COLOR", "CLICOLOR_FORCE", "CITROPY_REMOTE_TOKEN", "CITROPY_DESKTOP_TOKEN"]) delete (env as NodeJS.ProcessEnv)[key];
    const pty = spawn(program, args, { cwd: input.cwd, ...clampSize(input.cols, input.rows), env: env as Record<string, string>, name: "xterm-256color" });
    const session = { id: input.id, sessionId: randomUUID(), cwd: input.cwd, command: input.command, panel: input.panel, output: input.command ? `${input.command}\r\n` : "", offset: input.command ? input.command.length + 2 : 0, running: true, busy: undefined as boolean | undefined, process: undefined as string | undefined, pty: pty as IPty | undefined, pending: "", timer: undefined as NodeJS.Timeout | undefined, blocked: new Set<string>() };
    this.#sessions.set(input.id, session);
    this.#scheduleActivity();
    const flush = () => {
      session.timer = undefined;
      if (!session.pending) return;
      let length = Math.min(session.pending.length, FLUSH_CHUNK);
      const last = session.pending.charCodeAt(length - 1);
      if (last >= 0xd800 && last <= 0xdbff) length--;
      const data = session.pending.slice(0, length);
      session.pending = session.pending.slice(length);
      this.#emit({ type: "data", id: input.id, data, offset: session.offset - session.pending.length });
      if (session.pending.length) session.timer = setTimeout(flush, FLUSH_DELAY_MS);
      if (session.pending.length < RESUME_BELOW && !session.blocked.size) session.pty?.resume();
    };
    pty.onData(data => {
      if (this.#sessions.get(input.id) !== session) return;
      appendOutput(session, data);
      session.pending += data;
      if (session.pending.length > PAUSE_ABOVE) session.pty?.pause();
      if (!session.timer) session.timer = setTimeout(flush, FLUSH_DELAY_MS);
    });
    pty.onExit(({ exitCode }) => {
      if (this.#sessions.get(input.id) !== session) return;
      session.pty = undefined;
      const finish = () => {
        if (this.#sessions.get(input.id) !== session) return;
        if (session.pending.length) { setTimeout(finish, 20); return; }
        Object.assign(session, { code: exitCode, running: false, busy: false, process: undefined });
        appendOutput(session, exitNotice(exitCode));
        this.#emit({ type: "exit", id: input.id, code: exitCode });
      };
      finish();
    });
    return this.list().find(session => session.id === input.id)!;
  }

  write(id: string, data: string): void {
    const pty = this.#sessions.get(id)?.pty;
    if (!pty) throw new Error("This terminal has exited. Open a new terminal.");
    if (typeof data !== "string" || data.length > MAX_INPUT_LENGTH) throw new Error("Terminal input is too large.");
    pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    const size = clampSize(cols, rows);
    this.#sessions.get(id)?.pty?.resize(size.cols, size.rows);
  }

  flow(id: string, client: string, paused: boolean): void {
    const session = this.#sessions.get(id);
    if (!session) return;
    if (paused) session.blocked.add(client); else session.blocked.delete(client);
    if (session.blocked.size) session.pty?.pause();
    else if (session.pending.length < PAUSE_ABOVE) session.pty?.resume();
  }

  release(client: string): void { for (const id of this.#sessions.keys()) this.flow(id, client, false); }

  async close(id: string): Promise<void> {
    const session = this.#sessions.get(id);
    if (!session) return;
    this.#sessions.delete(id);
    if (![...this.#sessions.values()].some(entry => entry.pty)) { clearTimeout(this.#poll); this.#poll = undefined; }
    clearTimeout(session.timer);
    session.pending = "";
    if (session.pty) {
      stopProcess(session.pty, true);
      (session.pty as IPty & { destroy(): void }).destroy();
      await waitForStoppedProcesses();
    }
  }

  async closeAll(): Promise<void> { await Promise.all([...this.#sessions.keys()].map(id => this.close(id))); }
}
