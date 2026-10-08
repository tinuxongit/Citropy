import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { CircleCheckIcon, ClockIcon } from "../icons/status.tsx";
import { MonitorIcon } from "../icons/hardware.tsx";
import { PinIcon } from "../icons/actions.tsx";
import { FolderIcon } from "../icons/folders.tsx";
import type { Project, ThreadMeta } from "../../../../shared/protocol.ts";
import type { CachedThread } from "../../lib/environment.ts";
import { threadIsActive } from "../../lib/format.ts";
import { setSidebarGroupOpen, useApp } from "../../lib/store.ts";
import { ServerIcon } from "../ServerIcon.tsx";
import type { WorkspaceScope } from "../WorkspaceSelector.tsx";

type Category = "pinned" | "snoozed" | "finished";

export type SidebarThread =
  | { environment: string; thread: ThreadMeta; cached?: false }
  | { environment: string; thread: CachedThread; cached: true };

export interface ThreadGroup {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  threads: SidebarThread[];
  open: boolean;
  toggle: () => void;
  project?: Project;
  environment?: string;
  offline?: boolean;
  section?: WorkspaceScope;
  heading?: "section";
  parent?: string;
}

export interface ThreadListRow {
  key: string;
  group: ThreadGroup;
  item?: SidebarThread;
  empty: boolean;
}

const CATEGORIES: { id: Category; label: string; icon: ThreadGroup["icon"]; heading?: "section" }[] = [
  { id: "pinned", label: "Pinned", icon: PinIcon, heading: "section" },
  { id: "snoozed", label: "Snoozed", icon: ClockIcon },
  { id: "finished", label: "Finished", icon: CircleCheckIcon },
];

type Sortable = Pick<ThreadMeta, "position" | "updatedAt">;

const sortThreads = (a: Sortable, b: Sortable) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt;

export const shownThreads = (group: ThreadGroup, searching: boolean, selected: string | undefined) =>
  group.open || searching ? group.threads : group.threads.filter((item) => threadKey(item.environment, item.thread.id) === selected || (!item.cached && threadIsActive(item.thread)));

export const threadKey =(environment: string, id: string) => `thread:${environment}:${id}`;
const sortItems = (a: SidebarThread, b: SidebarThread) => sortThreads(a.thread, b.thread);

function categoryOf({ pinned, finished, archived, snoozedUntil }: Pick<ThreadMeta, "pinned" | "finished" | "archived" | "snoozedUntil">): Category | undefined {
  if (snoozedUntil) return archived ? undefined : "snoozed";
  if (finished) return "finished";
  return pinned && !archived ? "pinned" : undefined;
}

function placeThreads(threads: SidebarThread[], environments: EnvironmentFolders[], searching: boolean) {
  const cached = searching ? [] : environments.flatMap(({ environment, cachedThreads }) => (cachedThreads ?? []).map((thread): SidebarThread => ({ thread, environment, cached: true })));
  const categories: Record<Category, SidebarThread[]> = { pinned: [], snoozed: [], finished: [] };
  const byProject = new Map<string, SidebarThread[]>();
  for (const item of [...threads, ...cached]) {
    if (!item.cached && item.thread.parentThreadId && !searching) continue;
    const category = categoryOf(item.thread);
    if (category) {
      categories[category].push(item);
      continue;
    }
    if (item.cached && item.thread.archived) continue;
    const key = `${item.environment}:${item.thread.projectId}`;
    const entry = byProject.get(key);
    if (entry) entry.push(item);
    else byProject.set(key, [item]);
  }
  for (const list of Object.values(categories)) list.sort(sortItems);
  return { categories, byProject };
}

function revealedCategory(root: ThreadMeta | undefined): Category | undefined {
  if (!root) return undefined;
  if (root.finished) return "finished";
  if (root.pinned) return "pinned";
  return undefined;
}

export function movableSiblings(groups: ThreadGroup[], item: SidebarThread): SidebarThread[] {
  const group = groups.find((entry) => entry.threads.some((sibling) => sibling.environment === item.environment && sibling.thread.id === item.thread.id));
  if (!group) return [];
  return group.threads.filter((sibling) => !sibling.cached && sibling.environment === item.environment && sibling.thread.projectId === item.thread.projectId);
}

export function threadOrderAfterMove(
  groups: ThreadGroup[],
  environment: string,
  projectId: string,
  source: string,
  target: string,
  edge?: "before" | "after",
): string[] | undefined {
  if (!groups.some((group) => group.threads.some((item) => !item.cached && item.environment === environment && item.thread.id === source) && group.threads.some((item) => !item.cached && item.environment === environment && item.thread.id === target))) return undefined;
  const ordered = groups.flatMap((group) => group.threads.filter((item) => !item.cached && item.environment === environment && item.thread.projectId === projectId).map((item) => item.thread.id));
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
  projects: Project[];
  cachedThreads?: CachedThread[];
}

const DEFAULT_OPEN: Record<string, boolean> = { pinned: true, snoozed: false, finished: false };

const SECTIONS: { id: WorkspaceScope; label: string; icon: ThreadGroup["icon"]; server: boolean }[] = [
  { id: "local", label: "Local", icon: MonitorIcon, server: false },
  { id: "servers", label: "Servers", icon: ServerIcon, server: true },
];

export function useThreadGroups({ threads, query, environments, sections, activeEnvironment, activeRoot, activeThreadId }: {
  threads: SidebarThread[];
  query: string;
  environments: EnvironmentFolders[];
  sections: WorkspaceScope[];
  activeEnvironment: string;
  activeRoot: ThreadMeta | undefined;
  activeThreadId: string | null;
}) {
  const stored = useApp((state) => state.sidebarGroups);
  const isOpen = (key: string) => stored[key] ?? DEFAULT_OPEN[key] ?? true;
  const reveal = (key: string) => { if (!isOpen(key)) setSidebarGroupOpen(key, true); };
  const revealed = revealedCategory(activeRoot);
  const revealedKey = useRef(`${activeEnvironment}:${activeThreadId}:${revealed}`);
  useEffect(() => {
    const key = `${activeEnvironment}:${activeThreadId}:${revealed}`;
    if (revealedKey.current === key) return;
    revealedKey.current = key;
    if (revealed) reveal(revealed);
  }, [activeEnvironment, activeThreadId, revealed]);

  const searching = Boolean(query);
  const selected = activeRoot && threadKey(activeEnvironment, activeRoot.id);
  const placed = useMemo(() => placeThreads(threads, environments, searching), [threads, environments, searching]);
  const groups = useMemo(() => {
    const group = (base: Omit<ThreadGroup, "open" | "toggle">, key: string): ThreadGroup => {
      const open = isOpen(key);
      return { ...base, open, toggle: () => setSidebarGroupOpen(key, !open) };
    };
    const category = (id: Category, groupThreads: SidebarThread[]) => group({ ...CATEGORIES.find((entry) => entry.id === id)!, threads: groupThreads }, id);

    const foldersOf = (servers: boolean) => environments.filter((entry) => entry.server === servers).flatMap(({ environment, server, projects, cachedThreads }): ThreadGroup[] => {
      const icon = server ? ServerIcon : FolderIcon;
      const projectKey = (id: string) => environment === "local" ? `project:${id}` : `environment:${environment}:project:${id}`;
      return projects.map((project) => group({
        id: projectKey(project.id),
        label: project.name,
        icon,
        threads: (placed.byProject.get(`${environment}:${project.id}`) ?? []).sort(sortItems),
        project,
        environment,
        offline: cachedThreads !== undefined,
      }, projectKey(project.id))).filter((entry) => !searching || entry.threads.length > 0);
    });
    const folders = SECTIONS.flatMap(({ id, label, icon, server }): ThreadGroup[] => {
      if (searching || !sections.includes(id)) return foldersOf(server);
      const heading = group({ id: `section:${id}`, label, icon, threads: [], section: id, heading: "section" }, `section:${id}`);
      return [heading, ...(heading.open ? foldersOf(server).map((folder) => ({ ...folder, parent: heading.id })) : [])];
    });
    return [
      ...(placed.categories.pinned.length ? [category("pinned", placed.categories.pinned)] : []),
      ...folders,
      ...(placed.categories.snoozed.length ? [category("snoozed", placed.categories.snoozed)] : []),
      ...(placed.categories.finished.length ? [category("finished", placed.categories.finished)] : []),
    ];
  }, [placed, environments, sections, stored, searching]);

  const rows = useMemo(() => groups.flatMap((group): ThreadListRow[] => [
    { key: group.id, group, empty: false },
    ...shownThreads(group, searching, selected).map((item) => ({ key: threadKey(item.environment, item.thread.id), group, item, empty: false })),
    ...(group.project && group.open && !searching && !group.threads.length ? [{ key: `${group.id}:empty`, group, empty: true }] : []),
  ]), [groups, searching, selected]);

  return { groups, rows, selected, revealFinished: () => reveal("finished") };
}
