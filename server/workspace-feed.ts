import { homedir } from "node:os";
import type { WebSocket } from "ws";
import { bus } from "./bus.ts";
import { store } from "./store.ts";
import { workspaceThread, type WorkspaceEvent, type WorkspaceThread } from "../shared/workspace-catalog.ts";

export function attachWorkspaceFeed(socket: WebSocket): void {
  const fingerprints = new Map<string, string>();
  const pending = new Map<string, WorkspaceThread>();
  let timer: NodeJS.Timeout | undefined;
  const fingerprint = (thread: WorkspaceThread) => JSON.stringify({ ...thread, updatedAt: 0 });
  const send = (event: WorkspaceEvent) => {
    if (socket.bufferedAmount > 1024 * 1024) { socket.close(1013, "Workspace updates fell behind."); return; }
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  };
  const threads = store.allMeta().filter(thread => !thread.parentThreadId).map(workspaceThread);
  for (const thread of threads) fingerprints.set(thread.id, fingerprint(thread));
  send({ t: "workspace.snapshot", snapshot: { home: homedir(), projects: [...store.projects.values()].sort((a, b) => b.lastOpened - a.lastOpened), threads } });
  const unsubscribe = bus.subscribe(event => {
    if (event.t === "thread.upsert" && !event.thread.parentThreadId) {
      const thread = workspaceThread(event.thread);
      const key = fingerprint(thread);
      if (fingerprints.get(thread.id) === key) return;
      fingerprints.set(thread.id, key);
      pending.set(thread.id, thread);
      timer ??= setTimeout(() => {
        timer = undefined;
        for (const thread of pending.values()) send({ t: "workspace.thread", thread });
        pending.clear();
      }, 100);
      timer.unref();
    } else if (event.t === "thread.remove") {
      fingerprints.delete(event.id);
      pending.delete(event.id);
      send(event);
    } else if (event.t === "project.upsert" || event.t === "project.remove") {
      if (event.t === "project.remove") for (const [id, thread] of pending) if (thread.projectId === event.id) pending.delete(id);
      send(event);
    }
  });
  socket.on("message", () => socket.close(1008, "Workspace updates are read-only."));
  socket.on("close", () => { unsubscribe(); clearTimeout(timer); pending.clear(); });
}
