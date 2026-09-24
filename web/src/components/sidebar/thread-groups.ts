import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { Archive, CircleCheck, Clock, MessagesSquare, Pin, Server } from "lucide-react";
import type { Project, ThreadMeta } from "../../../../shared/protocol.ts";
import type { CachedThread } from "../../lib/environment.ts";
import { setSidebarGroupOpen, useApp } from "../../lib/store.ts";
import { Folder } from "../icons.ts";

type Category = "pinned" | "active" | "snoozed" | "archived" | "finished";

export interface ThreadGroup {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  threads: ThreadMeta[];
  cachedThreads?: CachedThread[];
  open: boolean;
  toggle: () => void;
  project?: Project;
  environment?: string;
}

export interface ThreadRow {
  key: string;
  group: ThreadGroup;
  thread?: ThreadMeta;
  cached?: CachedThread;
  empty: boolean;
}

const CATEGORIES: { id: Category; label: string; icon: ThreadGroup["icon"] }[] = [
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "active", label: "Active", icon: MessagesSquare },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "finished", label: "Finished", icon: CircleCheck },
];

type Sortable = Pick<ThreadMeta, "position" | "updatedAt">;

export const sortThreads = (a: Sortable, b: Sortable) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt;

function categorize(threads: ThreadMeta[], searching: boolean): Record<Category, ThreadMeta[]> {
  const roots = threads.filter((thread) => !thread.parentThreadId || searching);
  const awake = roots.filter((thread) => !thread.archived && !thread.snoozedUntil);
  return {
    pinned: awake.filter((thread) => !thread.finished && thread.pinned).sort(sortThreads),
    active: awake.filter((thread) => !thread.finished && !thread.pinned).sort(sortThreads),
    snoozed: roots.filter((thread) => !thread.archived && thread.snoozedUntil).sort(sortThreads),
    archived: roots.filter((thread) => thread.archived).sort(sortThreads),
    finished: awake.filter((thread) => thread.finished).sort(sortThreads),
  };
}

function revealedCategory(root: ThreadMeta | undefined): Category | undefined {
  if (!root) return undefined;
  if (root.finished) return "finished";
  if (root.pinned) return "pinned";
  if (!root.archived && !root.snoozedUntil) return "active";
  return undefined;
}

export function movableSiblings(groups: ThreadGroup[], thread: ThreadMeta, globalMode: boolean): ThreadMeta[] {
  const group = groups.find((entry) => entry.threads.some((sibling) => sibling.id === thread.id));
  if (!group) return [];
  return globalMode ? group.threads.filter((sibling) => sibling.projectId === thread.projectId) : group.threads;
}

export function threadOrderAfterMove(
  groups: ThreadGroup[],
  globalMode: boolean,
  projectId: string,
  source: string,
  target: string,
  edge?: "before" | "after",
): string[] | undefined {
  if (!groups.some((group) => group.threads.some((thread) => thread.id === source) && group.threads.some((thread) => thread.id === target))) return undefined;
  const ordered = groups.flatMap((group) => group.threads.filter((thread) => !globalMode || thread.projectId === projectId).map((thread) => thread.id));
  const from = ordered.indexOf(source);
  const to = ordered.indexOf(target);
  if (from < 0 || to < 0) return undefined;
  ordered.splice(from, 1);
  ordered.splice(ordered.indexOf(target) + ((edge ?? (from < to ? "after" : "before")) === "after" ? 1 : 0), 0, source);
  return ordered;
}

export interface EnvironmentFolders {
  environment: string;
  server: boolean;
  cached?: { projects: Project[]; threads: CachedThread[] };
}

const DEFAULT_OPEN: Record<string, boolean> = { pinned: true, active: true, snoozed: false, archived: false, finished: false };

export function useThreadGroups({ threads, query, globalMode, projects, environments, activeRoot, activeThreadId }: {
  threads: ThreadMeta[];
  query: string;
  globalMode: boolean;
  projects: Project[];
  environments: EnvironmentFolders[];
  activeRoot: ThreadMeta | undefined;
  activeThreadId: string | null;
}) {
  const stored = useApp((state) => state.sidebarGroups);
  const isOpen = (key: string) => stored[key] ?? DEFAULT_OPEN[key] ?? true;
  const reveal = (key: string) => { if (!isOpen(key)) setSidebarGroupOpen(key, true); };
  const revealed = revealedCategory(activeRoot);
  const revealedKey = useRef(`${activeThreadId}:${revealed}`);
  useEffect(() => {
    const key = `${activeThreadId}:${revealed}`;
    if (revealedKey.current === key) return;
    revealedKey.current = key;
    if (revealed) reveal(revealed);
  }, [activeThreadId, revealed]);

  const searching = Boolean(query);
  const categories = useMemo(() => categorize(threads, searching), [threads, searching]);
  const groups = useMemo(() => {
    const group = (base: Omit<ThreadGroup, "open" | "toggle">, key: string): ThreadGroup => {
      const open = isOpen(key);
      return { ...base, open, toggle: () => setSidebarGroupOpen(key, !open) };
    };
    const category = (id: Category, groupThreads: ThreadMeta[]) => group({ ...CATEGORIES.find((entry) => entry.id === id)!, threads: groupThreads }, id);
    if (!globalMode) return CATEGORIES.map(({ id }) => category(id, categories[id])).filter((entry) => entry.threads.length > 0);

    const finished = threads.filter((thread) => (!thread.parentThreadId || searching) && thread.finished).sort(sortThreads);
    const grouped = new Set([...categories.pinned, ...finished].map((thread) => thread.id));
    const byProject = new Map<string, ThreadMeta[]>();
    for (const thread of threads) {
      if ((thread.parentThreadId && !searching) || grouped.has(thread.id)) continue;
      const entry = byProject.get(thread.projectId);
      if (entry) entry.push(thread);
      else byProject.set(thread.projectId, [thread]);
    }
    const folders = environments.flatMap(({ environment, server, cached }): ThreadGroup[] => {
      const icon = server ? Server : Folder;
      if (!cached) return projects.map((project) => group({
        id: `project:${project.id}`,
        label: project.name,
        icon,
        threads: (byProject.get(project.id) ?? []).sort(sortThreads),
        project,
      }, `project:${project.id}`)).filter((entry) => !searching || entry.threads.length > 0);
      if (searching) return [];
      return cached.projects.map((project) => group({
        id: `environment:${environment}:project:${project.id}`,
        label: project.name,
        icon,
        threads: [],
        cachedThreads: cached.threads.filter((thread) => thread.projectId === project.id && !thread.archived && !thread.snoozedUntil && !thread.finished).sort(sortThreads),
        project,
        environment,
      }, `project:${project.id}`));
    });
    return [
      ...(categories.pinned.length ? [category("pinned", categories.pinned)] : []),
      ...folders,
      ...(finished.length ? [category("finished", finished)] : []),
    ];
  }, [globalMode, threads, projects, environments, stored, searching, categories]);

  const rows = useMemo(() => groups.flatMap((group): ThreadRow[] => [
    { key: group.id, group, empty: false },
    ...(group.open || searching ? group.threads.map((thread) => ({ key: thread.id, group, thread, empty: false })) : []),
    ...(group.open && group.cachedThreads ? group.cachedThreads.map((cached) => ({ key: `${group.id}:${cached.id}`, group, cached, empty: false })) : []),
    ...(group.project && !group.environment && group.open && !searching && !group.threads.length ? [{ key: `${group.id}:empty`, group, empty: true }] : []),
  ]), [groups, searching]);

  return { groups, rows, revealFinished: () => reveal("finished") };
}
