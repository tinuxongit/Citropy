import type { EnvironmentState } from "../../../shared/environments.ts";
import type { ServerEvent } from "../../../shared/protocol.ts";
import { workspaceThread, type WorkspaceEvent } from "../../../shared/workspace-catalog.ts";

interface Feed {
  endpoint: string;
  socket?: WebSocket;
  retry?: ReturnType<typeof setTimeout>;
  backoff: number;
}

const feeds = new Map<string, Feed>();

function close(feed: Feed): void {
  clearTimeout(feed.retry);
  if (!feed.socket) return;
  feed.socket.onmessage = null;
  feed.socket.onclose = null;
  feed.socket.onerror = null;
  feed.socket.close();
}

export function syncWorkspaceFeeds(state: EnvironmentState, receive: (id: string, event: WorkspaceEvent | null) => void): void {
  const endpoints = new Map<string, string>();
  if (state.activeId !== "local") endpoints.set("local", "");
  for (const connection of state.connections) {
    if (connection.id !== state.activeId && connection.status === "connected" && /^http:\/\/127\.0\.0\.1:\d+$/.test(connection.endpoint ?? ""))
      endpoints.set(connection.id, connection.endpoint!);
  }
  for (const [id, feed] of feeds) {
    if (endpoints.get(id) === feed.endpoint) continue;
    feeds.delete(id);
    close(feed);
    receive(id, null);
  }
  for (const [id, endpoint] of endpoints) {
    if (feeds.has(id)) continue;
    const feed: Feed = { endpoint, backoff: 500 };
    feeds.set(id, feed);
    const connect = () => {
      const url = new URL(`${endpoint}/socket?workspace=1`, location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      feed.socket = socket;
      socket.onmessage = message => {
        if (feeds.get(id) !== feed) return;
        try {
          const event = JSON.parse(message.data as string) as WorkspaceEvent | ServerEvent;
          if (event.t === "hello") {
            const { home, projects, threads } = event.snapshot;
            feed.backoff = 500;
            receive(id, { t: "workspace.snapshot", snapshot: { home, projects, threads: threads.filter(thread => !thread.parentThreadId).map(workspaceThread) } });
          } else if (event.t === "thread.upsert") {
            if (!event.thread.parentThreadId) receive(id, { t: "workspace.thread", thread: workspaceThread(event.thread) });
          } else if (event.t === "workspace.snapshot" || event.t === "workspace.thread" || event.t === "thread.remove" || event.t === "project.upsert" || event.t === "project.remove") {
            feed.backoff = 500;
            receive(id, event);
          }
        } catch { socket.close(); }
      };
      socket.onclose = () => {
        if (feeds.get(id) !== feed) return;
        receive(id, null);
        feed.retry = setTimeout(connect, feed.backoff);
        feed.backoff = Math.min(feed.backoff * 2, 8000);
      };
      socket.onerror = () => socket.close();
    };
    connect();
  }
}

export function closeWorkspaceFeeds(): void {
  for (const feed of feeds.values()) close(feed);
  feeds.clear();
}
