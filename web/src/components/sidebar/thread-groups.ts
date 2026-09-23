import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Archive, CircleCheck, Clock, MessagesSquare, Pin } from "lucide-react";
import type { Project, ThreadMeta } from "../../../../shared/protocol.ts";
import { Folder } from "../icons.ts";

type Category = "pinned" | "active" | "snoozed" | "archived" | "finished";

export interface ThreadGroup {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  threads: ThreadMeta[];
  open: boolean;
  toggle: () => void;
  project?: Project;
}

export interface ThreadRow {
  key: string;
  group: ThreadGroup;
  thread?: ThreadMeta;
  empty: boolean;
}

const CATEGORIES: { id: Category; label: string; icon: ThreadGroup["icon"] }[] = [
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "active", label: "Active", icon: MessagesSquare },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "finished", label: "Finished", icon: CircleCheck },
];

export const sortThreads = (a: ThreadMeta, b: ThreadMeta) =>
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

export function useThreadGroups({ threads, query, globalMode, projects, activeRoot, activeThreadId }: {
  threads: ThreadMeta[];
  query: string;
  globalMode: boolean;
  projects: Project[];
  activeRoot: ThreadMeta | undefined;
  activeThreadId: string | null;
}) {
  const [open, setOpen] = useState<Record<Category, boolean>>({ pinned: true, active: true, snoozed: false, archived: false, finished: false });
  const [closedProjects, setClosedProjects] = useState<Set<string>>(() => new Set());
  const reveal = (category: Category) => setOpen((current) => current[category] ? current : { ...current, [category]: true });
  const revealed = revealedCategory(activeRoot);
  useEffect(() => {
    if (revealed) reveal(revealed);
  }, [activeThreadId, revealed]);

  const searching = Boolean(query);
  const categories = useMemo(() => categorize(threads, searching), [threads, searching]);
  const groups = useMemo(() => {
    const category = (id: Category, groupThreads: ThreadMeta[]): ThreadGroup => ({
      ...CATEGORIES.find((entry) => entry.id === id)!,
      threads: groupThreads,
      open: open[id],
      toggle: () => setOpen((current) => ({ ...current, [id]: !current[id] })),
    });
    if (!globalMode) return CATEGORIES.map(({ id }) => category(id, categories[id])).filter((group) => group.threads.length > 0);

    const finished = threads.filter((thread) => (!thread.parentThreadId || searching) && thread.finished).sort(sortThreads);
    const grouped = new Set([...categories.pinned, ...finished].map((thread) => thread.id));
    const byProject = new Map<string, ThreadMeta[]>();
    for (const thread of threads) {
      if ((thread.parentThreadId && !searching) || grouped.has(thread.id)) continue;
      const group = byProject.get(thread.projectId);
      if (group) group.push(thread);
      else byProject.set(thread.projectId, [thread]);
    }
    const folders = projects.map((project): ThreadGroup => ({
      id: `project:${project.id}`,
      label: project.name,
      icon: Folder,
      threads: (byProject.get(project.id) ?? []).sort(sortThreads),
      open: !closedProjects.has(project.id),
      toggle: () => setClosedProjects((current) => {
        const next = new Set(current);
        if (!next.delete(project.id)) next.add(project.id);
        return next;
      }),
      project,
    })).filter((group) => !searching || group.threads.length > 0);
    return [
      ...(categories.pinned.length ? [category("pinned", categories.pinned)] : []),
      ...folders,
      ...(finished.length ? [category("finished", finished)] : []),
    ];
  }, [globalMode, threads, projects, closedProjects, searching, categories, open]);

  const rows = useMemo(() => groups.flatMap((group): ThreadRow[] => [
    { key: group.id, group, empty: false },
    ...(group.open || searching ? group.threads.map((thread) => ({ key: thread.id, group, thread, empty: false })) : []),
    ...(group.project && group.open && !searching && !group.threads.length ? [{ key: `${group.id}:empty`, group, empty: true }] : []),
  ]), [groups, searching]);

  return { groups, rows, revealFinished: () => reveal("finished") };
}
