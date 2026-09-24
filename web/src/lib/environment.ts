import { useSyncExternalStore } from "react";
import type { EnvironmentState } from "../../../shared/environments.ts";
import type { Project, ThreadMeta } from "../../../shared/protocol.ts";
import { workspaceThread, type WorkspaceCatalog as WorkspaceSnapshot, type WorkspaceEvent, type WorkspaceThread } from "../../../shared/workspace-catalog.ts";
import { closeWorkspaceFeeds, syncWorkspaceFeeds } from "./workspace-feed.ts";

let initial: EnvironmentState = { activeId: "local", endpoint: "", connections: [] };
let controller = new AbortController();
let switching: string | null = null;
let pendingConnection: AbortController | null = null;
let selection = 0;
let pushes = 0;
const listeners = new Set<() => void>();
export type CachedThread = WorkspaceThread;
type WorkspaceCatalog = Record<string, WorkspaceSnapshot & { connected?: boolean }>;
let workspaces: WorkspaceCatalog = {};
let catalogTimer: ReturnType<typeof setTimeout> | undefined;
try {
  const saved = typeof localStorage === "undefined" ? {} : JSON.parse(localStorage.getItem("citropy.workspaces") || "{}");
  for (const [id, value] of Object.entries(saved) as [string, WorkspaceCatalog[string]][]) {
    if (typeof value?.home === "string" && Array.isArray(value.projects))
      workspaces[id] = {
        home: value.home,
        projects: value.projects.filter(project => typeof project?.id === "string" && typeof project.name === "string" && typeof project.path === "string"),
        threads: Array.isArray(value.threads) ? value.threads.filter(thread => typeof thread?.id === "string" && typeof thread.projectId === "string" && typeof thread.title === "string") : [],
      };
  }
} catch {}

function publish(): void { for (const listener of listeners) listener(); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function saveCatalog(): void {
  catalogTimer ??= setTimeout(() => {
    catalogTimer = undefined;
    try { localStorage.setItem("citropy.workspaces", JSON.stringify(workspaces)); } catch {}
  }, 1000);
}

function receiveWorkspace(id: string, event: WorkspaceEvent | null): void {
  const current = workspaces[id];
  if (!event) {
    if (current?.connected) { workspaces = { ...workspaces, [id]: { ...current, connected: false } }; publish(); }
    return;
  }
  if (id === initial.activeId) return;
  let next: WorkspaceCatalog[string];
  if (event.t === "workspace.snapshot") next = { ...event.snapshot, connected: true };
  else if (!current) return;
  else if (event.t === "workspace.thread") {
    const index = current.threads.findIndex(thread => thread.id === event.thread.id);
    const previous = current.threads[index];
    if (previous && JSON.stringify({ ...previous, updatedAt: 0 }) === JSON.stringify({ ...event.thread, updatedAt: 0 })) return;
    const threads = [...current.threads];
    if (index < 0) threads.push(event.thread);
    else threads[index] = event.thread;
    next = { ...current, threads };
  } else if (event.t === "thread.remove") next = { ...current, threads: current.threads.filter(thread => thread.id !== event.id) };
  else if (event.t === "project.upsert") next = { ...current, projects: [...current.projects.filter(project => project.id !== event.project.id), event.project].sort((a, b) => b.lastOpened - a.lastOpened) };
  else if (event.t === "project.remove") next = { ...current, projects: current.projects.filter(project => project.id !== event.id), threads: current.threads.filter(thread => thread.projectId !== event.id) };
  else return;
  workspaces = { ...workspaces, [id]: next };
  saveCatalog();
  publish();
}

function syncWorkspaces(): void {
  if (window.citropyDesktop?.environmentsState) syncWorkspaceFeeds(initial, receiveWorkspace);
}

export async function initializeEnvironment(): Promise<void> {
  if (window.citropyDesktop?.environmentsState) initial = await window.citropyDesktop.environmentsState();
  if (initial.activeId !== "local" && !/^http:\/\/127\.0\.0\.1:\d+$/.test(initial.endpoint))
    throw new Error("The SSH environment has no local tunnel endpoint.");
  const unsubscribe = window.citropyDesktop?.onEnvironmentsState?.(value => {
    pushes++;
    initial = { ...value, activeId: initial.activeId, endpoint: initial.endpoint };
    syncWorkspaces();
    publish();
  });
  syncWorkspaces();
  if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe?.(); controller.abort(); closeWorkspaceFeeds(); clearTimeout(catalogTimer); });
}

export function environmentId(): string { return initial.activeId; }
export function environmentSignal(): AbortSignal { return controller.signal; }
export function isRemote(): boolean { return initial.activeId !== "local"; }
export function environmentName(): string { return initial.connections.find(entry => entry.id === initial.activeId)?.name || "Local"; }
export function connectionName(id: string): string { return initial.connections.find(entry => entry.id === id)?.name || id; }
export function serverUrl(path: string): string { return `${initial.endpoint}${path}`; }
export function environmentUrl(id: string, path: string): string {
  if (id === initial.activeId) return serverUrl(path);
  if (id === "local") return path;
  const connection = initial.connections.find(entry => entry.id === id);
  if (connection?.status !== "connected" || !connection.endpoint) throw new Error(`Connect to ${connection?.name ?? id} to change its conversations.`);
  return `${connection.endpoint}${path}`;
}

export function useEnvironments(): EnvironmentState {
  return useSyncExternalStore(subscribe, () => initial);
}

export function useWorkspaceCatalog(): WorkspaceCatalog {
  return useSyncExternalStore(subscribe, () => workspaces);
}

export function rememberWorkspaces(projects: Project[], home: string, threads: ThreadMeta[]): void {
  const entry = {
    home,
    projects: projects.map(({ id, name, path, isGit, lastOpened }) => ({ id, name, path, isGit, lastOpened })),
    threads: threads.filter(thread => !thread.parentThreadId).map(workspaceThread),
  };
  if (JSON.stringify(entry) === JSON.stringify(workspaces[initial.activeId])) return;
  workspaces = { ...workspaces, [initial.activeId]: entry };
  try { localStorage.setItem("citropy.workspaces", JSON.stringify(workspaces)); } catch {}
  publish();
}

export async function selectEnvironment(id: string, projectId?: string, threadId?: string): Promise<void> {
  const desktop = window.citropyDesktop;
  if (!desktop?.connectEnvironment) throw new Error("Open Citropy desktop to use SSH environments.");
  if (switching && id !== "local") throw new Error("Wait for the current connection or cancel it first.");
  pendingConnection?.abort();
  const pending = new AbortController();
  pendingConnection = pending;
  const turn = ++selection;
  const pushesBefore = pushes;
  switching = id;
  try {
    const snapshot = await desktop.connectEnvironment(id);
    if (turn !== selection) return;
    if (id !== "local" && !/^http:\/\/127\.0\.0\.1:\d+$/.test(snapshot.endpoint)) throw new Error("The SSH environment has no local tunnel endpoint.");
    const [{ connect, disconnect, waitUntilConnected, prepareConnection }, { resetEnvironment, selectProject, selectThread, useApp }] = await Promise.all([import("./socket.ts"), import("./store.ts")]);
    if (turn !== selection) return;
    const next = pushes === pushesBefore ? snapshot : { ...snapshot, connections: initial.connections };
    if (id !== initial.activeId) {
      const prepared = await prepareConnection(snapshot.endpoint, pending.signal, threadId);
      if (turn !== selection) { prepared.socket.close(); return; }
      disconnect(true);
      controller.abort();
      controller = new AbortController();
      initial = pushes === pushesBefore ? snapshot : { ...snapshot, connections: initial.connections };
      resetEnvironment(workspaces[id]?.projects ?? [], workspaces[id]?.home ?? "");
      connect(prepared);
      if (projectId && useApp.getState().projects.some(project => project.id === projectId) && (useApp.getState().activeProjectId !== projectId || (!threadId && useApp.getState().activeThreadId !== null))) selectProject(projectId);
      if (threadId && useApp.getState().threads[threadId]?.projectId === projectId) selectThread(threadId);
      syncWorkspaces();
      publish();
    } else {
      initial = next;
      syncWorkspaces();
      publish();
      connect();
    }
    await waitUntilConnected(controller.signal);
    if (turn !== selection) return;
    if (projectId && (useApp.getState().activeProjectId !== projectId || (!threadId && useApp.getState().activeThreadId !== null))) {
      if (!useApp.getState().projects.some(project => project.id === projectId)) throw new Error("This workspace is no longer open on that host.");
      selectProject(projectId);
    }
    if (threadId) {
      if (useApp.getState().threads[threadId]?.projectId !== projectId) throw new Error("This conversation is no longer on that host.");
      selectThread(threadId);
    }
  } catch (error) {
    if (turn === selection) throw error;
  } finally {
    if (turn === selection) { switching = null; pendingConnection = null; }
  }
}

function storageKey(key: string, id: string): string {
  return id !== "local" && (/^citropy\.(project|thread|offline)$/.test(key) || key.startsWith("citropy.draft."))
    ? `citropy.environment.${id}.${key}` : key;
}

export const environmentStorage = {
  getItem(key: string, id = initial.activeId): string | null { return localStorage.getItem(storageKey(key, id)); },
  setItem(key: string, value: string, id = initial.activeId): void { localStorage.setItem(storageKey(key, id), value); },
  removeItem(key: string, id = initial.activeId): void { localStorage.removeItem(storageKey(key, id)); },
};
