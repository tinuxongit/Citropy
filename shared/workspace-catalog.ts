import type { Project, ThreadMeta } from "./protocol.ts";

export type WorkspaceThread = Pick<ThreadMeta, "id" | "projectId" | "provider" | "title" | "updatedAt" | "position" | "pinned" | "finished" | "archived" | "snoozedUntil" | "running" | "status">;

export interface WorkspaceCatalog {
  home: string;
  projects: Project[];
  threads: WorkspaceThread[];
}

export type WorkspaceEvent =
  | { t: "workspace.snapshot"; snapshot: WorkspaceCatalog }
  | { t: "workspace.thread"; thread: WorkspaceThread }
  | { t: "thread.remove"; id: string }
  | { t: "project.upsert"; project: Project }
  | { t: "project.remove"; id: string };

export function workspaceThread(thread: ThreadMeta): WorkspaceThread {
  const { id, projectId, provider, title, updatedAt, position, pinned, finished, archived, snoozedUntil, running, status } = thread;
  return { id, projectId, provider, title, updatedAt, position, pinned, finished, archived, snoozedUntil, running, status };
}
