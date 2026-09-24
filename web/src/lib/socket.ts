import { rememberWorkspaces, serverUrl } from "./environment.ts";
import { applyEvents, useApp } from "./store.ts";
import { rejectResponses, resolveResponse } from "./requests.ts";
import type { ClientEvent, ServerEvent } from "../../../shared/protocol.ts";

type TermListener = (
  event: Extract<ServerEvent, { t: "term.data" } | { t: "term.exit" }>,
) => void;

const termListeners = new Set<TermListener>();
const shellOutputListeners = new Set<(event: Extract<ServerEvent, { t: "shell.output" }>) => void>();

export function onShellOutput(listener: (event: Extract<ServerEvent, { t: "shell.output" }>) => void): () => void {
  shellOutputListeners.add(listener);
  return () => { shellOutputListeners.delete(listener); };
}
let socket: WebSocket | null = null;
let queue: ServerEvent[] = [];
let frame = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = 400;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const outbox: ClientEvent[] = [];
let sequence = 0;
let epoch = "";
let rememberTimer: ReturnType<typeof setTimeout> | null = null;

function rememberCatalog(): void {
  if (rememberTimer) clearTimeout(rememberTimer);
  rememberTimer = null;
  const state = useApp.getState();
  rememberWorkspaces(state.projects, state.home, Object.values(state.threads));
}

function flush(): void {
  if (frame) cancelAnimationFrame(frame);
  if (timer) clearTimeout(timer);
  frame = 0;
  timer = null;
  const batch = queue;
  queue = [];
  if (batch.length === 0) return;
  useApp.setState((previous) => applyEvents(previous, batch));
  if (batch.some(event => ["hello", "project.upsert", "project.remove"].includes(event.t))) rememberCatalog();
  else if (!rememberTimer && batch.some(event => event.t === "thread.upsert" || event.t === "thread.remove")) rememberTimer = setTimeout(rememberCatalog, 1000);
  const notifications = useApp.getState().notifications;
  const read: string[] = [];
  for (const event of batch) {
    if (
      event.t === "notification.add" &&
      !event.notification.read &&
      notifications.some(
        (notification) =>
          notification.id === event.notification.id && notification.read,
      )
    )
      read.push(event.notification.id);
  }
  if (read.length) send({ t: "notifications.read", ids: read });
}

function enqueue(event: ServerEvent): void {
  queue.push(event);
  if (frame === 0) frame = requestAnimationFrame(flush);
  if (timer === null) timer = setTimeout(flush, 40);
}

export function onTerminal(listener: TermListener): () => void {
  termListeners.add(listener);
  return () => termListeners.delete(listener);
}

export function send(event: ClientEvent): void {
  if (
    (event.t.startsWith("git.") ||
      event.t.startsWith("file.") ||
      event.t === "term.open") &&
    "projectId" in event &&
    !event.threadId
  ) {
    const state = useApp.getState();
    const thread = state.threads[state.activeThreadId ?? ""];
    if (thread && thread.projectId === event.projectId)
      event = { ...event, threadId: thread.id };
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
    return;
  }
  if ("requestId" in event && event.requestId) {
    resolveResponse(
      event.requestId,
      undefined,
      "Citropy is reconnecting. This request was not sent.",
    );
    return;
  }
  if (
    [
      "browser.action",
      "desktop.open",
      "panel.open",
      "panel.close",
      "panel.rename",
      "panel.move",
      "term.data",
      "term.ack",
      "term.unsubscribe",
      "shell.watch",
    ].includes(event.t)
  )
    return;
  outbox.push(event);
}

export async function prepareConnection(endpoint: string, signal: AbortSignal, threadId?: string): Promise<{ socket: WebSocket; events: ServerEvent[] }> {
  const url = new URL(`${endpoint}/socket`, location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const pending = new WebSocket(url);
  const events: ServerEvent[] = [];
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      cleanup();
      pending.onclose = null;
      pending.onerror = null;
      pending.onmessage = null;
      pending.close();
      reject(error);
    };
    const abort = () => fail(new DOMException("Environment changed", "AbortError"));
    const timeout = setTimeout(() => fail(new Error("The workspace connection timed out. Reconnect to try again.")), 20000);
    signal.addEventListener("abort", abort, { once: true });
    pending.onerror = () => fail(new Error("Could not connect to the workspace."));
    pending.onclose = () => fail(new Error("The workspace connection closed before it was ready."));
    pending.onmessage = message => {
      try {
        const event = JSON.parse(message.data as string) as ServerEvent;
        events.push(event);
        if (event.t === "hello" && threadId && event.snapshot.threads.some(thread => thread.id === threadId)) {
          pending.send(JSON.stringify({ t: "thread.load", id: threadId }));
        } else if (event.t === "hello" || (event.t === "thread.messages" && event.threadId === threadId)) {
          cleanup();
          resolve({ socket: pending, events });
        }
      } catch { fail(new Error("The workspace sent an invalid response.")); }
    };
    if (signal.aborted) abort();
  });
}

export function connect(prepared?: { socket: WebSocket; events: ServerEvent[] }): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  )
    return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const url = new URL(serverUrl("/socket"), `${location.protocol}//${location.host}`);
  if (epoch) { url.searchParams.set("epoch", epoch); url.searchParams.set("after", String(sequence)); }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const current = prepared?.socket ?? new WebSocket(url);
  socket = current;

  current.onopen = () => {
    if (socket !== current) return;
    backoff = 400;
    while (outbox.length) {
      const event = outbox.shift();
      if (event) current.send(JSON.stringify(event));
    }
  };

  const receive = (event: ServerEvent) => {
    if (socket !== current) return;
    if (event.t === "hello") { epoch = event.epoch ?? ""; sequence = event.sequence ?? 0; }
    else if (event.t === "reconnected") {
      flush();
      epoch = event.epoch;
      sequence = event.sequence ?? sequence;
      useApp.setState({ connected: true, ...(event.shells ? { shells: Object.fromEntries(event.shells.map(shell => [shell.id, shell])) } : {}), ...(event.browsers ? { browsers: Object.fromEntries(event.browsers.map(browser => [browser.id, browser])) } : {}), ...(event.computer ? { computer: event.computer } : {}) });
      return;
    } else if (event.sequence !== undefined) {
      if (event.sequence <= sequence) return;
      if (sequence && event.sequence !== sequence + 1) { epoch = ""; current.close(); return; }
      sequence = event.sequence;
    }
    if (event.t === "shell.output") {
      for (const listener of shellOutputListeners) listener(event);
      return;
    }
    if (event.t === "term.data" || event.t === "term.exit") {
      for (const listener of termListeners) listener(event);
      return;
    }
    enqueue(event);
  };

  current.onmessage = message => receive(JSON.parse(message.data as string) as ServerEvent);

  current.onclose = () => {
    if (socket !== current) return;
    flush();
    useApp.setState({ connected: false });
    rejectResponses();
    socket = null;
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 1.7, 8000);
  };

  current.onerror = () => current.close();
  if (prepared) {
    backoff = 400;
    for (const event of prepared.events) receive(event);
    flush();
  }
}

export function disconnect(switching = false): void {
  flush();
  if (rememberTimer) rememberCatalog();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const current = socket;
  socket = null;
  if (current) {
    current.onopen = null;
    current.onmessage = null;
    current.onclose = null;
    current.onerror = null;
    current.close();
  }
  outbox.length = 0;
  termListeners.clear();
  shellOutputListeners.clear();
  epoch = "";
  sequence = 0;
  rejectResponses(switching);
  useApp.setState({ connected: false });
}

export function waitUntilConnected(signal: AbortSignal): Promise<void> {
  if (useApp.getState().connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      unsubscribe();
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new DOMException("Environment changed", "AbortError"));
    const unsubscribe = useApp.subscribe(state => { if (state.connected) finish(); });
    const timeout = setTimeout(() => finish(new Error("The workspace connection timed out. Reconnect to try again.")), 20000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

if (import.meta.hot) import.meta.hot.dispose(() => disconnect());

export function requestId(): string { return `req_${crypto.randomUUID()}`; }
