import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { createThread, openOnEnvironment, reorderThreads } from "../lib/actions.ts";
import { reportError } from "../lib/api.ts";
import { environmentId, isRemote, useEnvironments, useWorkspaceCatalog } from "../lib/environment.ts";
import { useI18n } from "../lib/i18n.ts";
import { scaled, selectProject, useApp } from "../lib/store.ts";
import { Collapsible } from "./Collapsible.tsx";
import { MessageSquarePlus, Search } from "./icons.ts";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { SidebarFooter } from "./SidebarFooter.tsx";
import { ThreadPreview } from "./ThreadPreview.tsx";
import { WorkspaceSelector } from "./WorkspaceSelector.tsx";
import { CachedThreadRow } from "./sidebar/CachedThreadRow.tsx";
import { CategoryToggle, ProjectHeading, StatusHeading } from "./sidebar/GroupHeadings.tsx";
import { movableSiblings, threadOrderAfterMove, useThreadGroups, type EnvironmentFolders, type ThreadGroup } from "./sidebar/thread-groups.ts";
import { ThreadRow } from "./sidebar/ThreadRow.tsx";
import { useProjectDrag } from "./sidebar/use-project-drag.ts";
import { useProjectOrder, type DropEdge } from "./sidebar/use-project-order.ts";
import { useThreadDrag } from "./sidebar/use-thread-drag.ts";
import { useThreadPreview } from "./sidebar/use-thread-preview.ts";
import { useThreadSearch } from "./sidebar/use-thread-search.ts";
import { rootThread, useThreadTree } from "./sidebar/use-thread-tree.ts";

const VIRTUALIZE_AFTER = 40;

function estimateRowHeight(globalMode: boolean, row: { thread?: ThreadMeta; cached?: unknown; empty: boolean } | undefined): number {
  if (row?.cached) return 34;
  if (row?.thread) return globalMode ? 34 : 96;
  if (row?.empty && globalMode) return 30;
  return 40;
}

export function Sidebar({
  onSettings,
  onGit,
  onGitHub,
  onConversation,
  onUsage,
}: {
  onSettings: () => void;
  onGit: () => void;
  onGitHub: () => void;
  onConversation: () => void;
  onUsage: () => void;
}) {
  const t = useI18n();
  const threadMap = useApp((state) => state.threads);
  const order = useApp((state) => state.threadOrder);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const activeThreadId = useApp((state) => state.activeThreadId);
  const providers = useApp((state) => state.providers);
  const projects = useApp((state) => state.projects);
  const connected = useApp((state) => state.connected);
  const creatingThread = useApp((state) => state.creatingThread);
  const uiScale = useApp((state) => state.uiScale);
  const globalMode = useApp((state) => state.sidebarMode === "global");
  const { activeId: environment, connections } = useEnvironments();
  const catalog = useWorkspaceCatalog();
  const [allProjects, setAllProjects] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedRow, setFocusedRow] = useState<string>();
  const viewport = useRef<HTMLDivElement>(null);
  const threadList = useRef<HTMLDivElement>(null);
  useEffect(() => setQuery(""), [activeProjectId, environment]);
  useEffect(() => { setFocusedRow(undefined); }, [environment]);

  const matches = useThreadSearch(query, globalMode || allProjects ? undefined : (activeProjectId ?? undefined));
  const threads = useMemo(
    () => (query.trim() ? (matches?.map((result) => result.threadId) ?? []) : order)
      .map((id) => threadMap[id])
      .filter((thread): thread is ThreadMeta => Boolean(thread && (query.trim() || globalMode || thread.projectId === activeProjectId))),
    [order, threadMap, activeProjectId, globalMode, query, matches],
  );
  const activeRoot = rootThread(threadMap, activeThreadId);
  const projectSets = useMemo(() => Object.fromEntries(["local", ...connections.map(connection => connection.id)].map(id =>
    [id, id === environment ? projects : catalog[id]?.projects ?? []],
  )), [environment, connections, projects, catalog]);
  const { orderedProjects, moveProject, moveProjectBy } = useProjectOrder(projectSets);
  const environments = useMemo(() => ["local", ...connections.map((connection) => connection.id)].flatMap((id): EnvironmentFolders[] => {
    if (id === environment) return [{ environment: id, server: isRemote() }];
    const cached = catalog[id];
    if (!cached?.projects.length) return [];
    return [{ environment: id, server: id !== "local", cached: { projects: orderedProjects[id] ?? [], threads: cached.threads } }];
  }), [environment, connections, catalog, orderedProjects]);
  const { groups, rows, revealFinished } = useThreadGroups({ threads, query, globalMode, projects: orderedProjects[environment] ?? [], environments, activeRoot, activeThreadId });
  const tree = useThreadTree(threadMap, activeThreadId);
  const rowOrder = rows.map((row) => row.key).join("\0");

  const reorder = (source: string, target: string, edge?: DropEdge) => {
    const projectId = globalMode ? threadMap[source]?.projectId : activeProjectId;
    if (source === target || query || !projectId) return;
    if (globalMode && threadMap[target]?.projectId !== projectId) return;
    const ids = threadOrderAfterMove(groups, globalMode, projectId, source, target, edge);
    if (ids) void reorderThreads(projectId, ids);
  };
  const moveThread = (thread: ThreadMeta, direction: number) => {
    const siblings = movableSiblings(groups, thread, globalMode);
    const next = siblings[siblings.findIndex((sibling) => sibling.id === thread.id) + direction];
    if (next) reorder(thread.id, next.id);
  };

  const dragResetKey = [environment, activeProjectId, query, connected, uiScale, rowOrder].join("\n");
  const threadDrag = useThreadDrag({ viewport, groups, globalMode, disabled: Boolean(query) || !connected, resetKey: dragResetKey, onDrop: reorder });
  const folderGroups = groups.filter(group => group.project);
  const projectDrag = useProjectDrag({ viewport, list: threadList, projects: folderGroups, disabled: Boolean(query), resetKey: dragResetKey, onMove: (source, target, edge) => {
    const from = folderGroups.find(group => group.id === source);
    const to = folderGroups.find(group => group.id === target);
    if (from?.project && to?.project && from.environment === to.environment) moveProject(from.environment!, from.project.id, to.project.id, edge);
  } });
  const preview = useThreadPreview({
    disabled: Boolean(threadDrag.draggingId),
    resetKey: [environment, activeProjectId, activeThreadId, query, rowOrder, uiScale].join("\n"),
  });

  const virtualized = rows.length > VIRTUALIZE_AFTER;
  const focusedIndex = rows.findIndex((row) => row.key === focusedRow);
  const draggingIndex = rows.findIndex((row) => row.key === threadDrag.draggingId);
  const activeIndex = rows.findIndex((row) => row.key === activeThreadId);
  const getItemKey = useCallback((index: number) => rows[index]!.key, [rows]);
  const list = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    enabled: virtualized,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: (index) => scaled(estimateRowHeight(globalMode, rows[index])),
    measureElement: (element) => element.offsetHeight,
    overscan: 3,
    rangeExtractor: useCallback((range: Range) => [...new Set([
      ...defaultRangeExtractor(range),
      ...[focusedIndex, draggingIndex, activeIndex].filter((index) => index >= 0),
    ])].sort((a, b) => a - b), [focusedIndex, draggingIndex, activeIndex]),
  });
  useEffect(() => {
    if (virtualized) list.measure();
  }, [globalMode, uiScale, virtualized]);
  useEffect(() => {
    if (!virtualized) return;
    const index = rows.findIndex((row) => row.thread?.id === activeRoot?.id);
    if (index >= 0) list.scrollToIndex(index, { align: "auto" });
  }, [activeThreadId, activeProjectId, query, virtualized, globalMode]);

  const canCreateThread = connected && !creatingThread && providers.some((provider) => provider.available && provider.enabled);
  const startThread = (group: ThreadGroup) => {
    const target = group.environment ?? environment;
    if (target === environment) {
      if (group.project!.id !== activeProjectId) selectProject(group.project!.id);
      onConversation();
      void createThread();
    } else void openOnEnvironment(target, group.project!.id).then(() => {
      if (environmentId() !== target) return;
      onConversation();
      return createThread();
    }).catch(reportError);
  };

  const renderEmpty = (group: ThreadGroup) => (
    <button className="global-project-empty" type="button" disabled={group.cachedThreads ? false : !canCreateThread} onClick={() => startThread(group)}>
      {t("Start a conversation")}
    </button>
  );

  const renderHeading = (group: ThreadGroup) => {
    const searching = Boolean(query);
    const project = group.project;
    if (project) return <ProjectHeading
      group={group}
      project={project}
      searching={searching}
      dragging={projectDrag.dragging === group.id}
      isFirst={orderedProjects[group.environment!]?.[0]?.id === project.id}
      isLast={orderedProjects[group.environment!]?.at(-1)?.id === project.id}
      canCreateThread={Boolean(group.cachedThreads) || canCreateThread}
      onDragStart={(event) => projectDrag.start(event, group.id)}
      consumeDrag={projectDrag.consumeDrag}
      onMove={(direction) => moveProjectBy(group.environment!, project.id, direction)}
      onNewThread={() => startThread(group)}
      onConversation={onConversation}
    />;
    if (globalMode) return <StatusHeading group={group} searching={searching} />;
    return <CategoryToggle group={group} searching={searching} />;
  };

  const renderThread = (thread: ThreadMeta) => <ThreadRow
    key={thread.id}
    thread={thread}
    globalMode={globalMode}
    query={query}
    match={matches?.find((result) => result.threadId === thread.id)}
    projectName={!globalMode && query.trim() && allProjects ? (projects.find((project) => project.id === thread.projectId)?.name ?? "") : undefined}
    categoryEnd={groups.some((group) => !group.cachedThreads?.length && group.threads.at(-1)?.id === thread.id)}
    drag={threadDrag}
    preview={preview}
    tree={tree}
    onMove={(direction) => moveThread(thread, direction)}
    onFinished={revealFinished}
    onConversation={onConversation}
  />;

  const renderGroup = (group: ThreadGroup) => {
    if (virtualized) return list.getVirtualItems().filter((item) => rows[item.index]?.group.id === group.id).map((item) => {
      const row = rows[item.index]!;
      return <div key={item.key} data-index={item.index} ref={list.measureElement} className="thread-list-item" style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}>
        {row.thread ? renderThread(row.thread) : row.cached ? <CachedThreadRow thread={row.cached} categoryEnd={row.cached === group.cachedThreads?.at(-1)} environment={group.environment!} connected={Boolean(catalog[group.environment!]?.connected)} onConversation={onConversation} /> : row.empty ? renderEmpty(group) : renderHeading(group)}
      </div>;
    });
    return <>
      {renderHeading(group)}
      <Collapsible open={group.open || Boolean(query)} className="thread-category-content">
        {group.threads.map((thread) => <div className="thread-list-item" key={thread.id}>{renderThread(thread)}</div>)}
        {group.cachedThreads?.map((thread) => <div className="thread-list-item" key={thread.id}><CachedThreadRow thread={thread} categoryEnd={thread === group.cachedThreads?.at(-1)} environment={group.environment!} connected={Boolean(catalog[group.environment!]?.connected)} onConversation={onConversation} /></div>)}
        {group.project && !query && !group.threads.length && !group.cachedThreads?.length && renderEmpty(group)}
      </Collapsible>
    </>;
  };

  const emptyMessage = !query
    ? t("Your conversations will appear here.")
    : !connected
      ? t("Reconnect to search conversations.")
      : !matches
        ? t("Searching…")
        : t("No matching conversations.");

  return (
    <aside className="rail" data-sidebar-mode={globalMode ? "global" : "workspaces"} aria-label={t("Conversations")}>
      <div className="thread-toolbar">
        <label className="thread-search">
          <Search size={14} aria-hidden="true" />
          <input
            aria-label={t("Find a conversation")}
            placeholder={t("Search conversations")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {globalMode ? <WorkspaceSelector addOnly /> : <button
          className="new-thread"
          aria-label={t("New thread")}
          title={t("New thread")}
          type="button"
          onClick={() => { onConversation(); createThread(); }}
          disabled={!canCreateThread || !activeProjectId}
        >
          <MessageSquarePlus size={18} />
        </button>}
      </div>
      {query.trim() && !globalMode && (
        <label className="search-scope">
          <input type="checkbox" checked={allProjects} onChange={(event) => setAllProjects(event.target.checked)} />
          {t("All workspaces")}
        </label>
      )}
      <div className="rail-scroll">
        <div className="rail-list scroll" ref={viewport}
          onScroll={(event) => {
            preview.hide();
            event.currentTarget.parentElement?.toggleAttribute("data-scrolled", event.currentTarget.scrollTop > 0);
          }}
          onFocusCapture={(event) => {
            const index = event.target.closest<HTMLElement>("[data-index]")?.dataset.index;
            if (index !== undefined) setFocusedRow(rows[Number(index)]?.key);
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(undefined);
          }}
        >
          <div className="thread-list" ref={threadList} data-virtualized={virtualized} data-dragging={Boolean(threadDrag.draggingId)} style={virtualized ? { height: list.getTotalSize(), position: "relative" } : undefined}>
            {groups.map((group) => <section className="thread-category" data-category={group.id} key={group.id} style={virtualized ? { display: "contents" } : undefined}>
              {renderGroup(group)}
            </section>)}
            {projectDrag.drop && <div className="project-drop-line" style={{ top: projectDrag.drop.top }} />}
          </div>
          {threads.length === 0 && (!globalMode || query || groups.length === 0) && <div className="rail-empty">{emptyMessage}</div>}
        </div>
      </div>
      {preview.shown && threadMap[preview.shown.threadId] && <ThreadPreview
        id={preview.id}
        thread={threadMap[preview.shown.threadId]!}
        anchor={preview.shown.anchor}
        onClose={preview.hide}
        onPointerEnter={preview.clearTimer}
        onPointerLeave={preview.leave}
      />}
      <SidebarFooter onGit={onGit} onGitHub={onGitHub} onSettings={onSettings} onUsage={onUsage} />
      <ResizeHandle panel="sidebar" />
    </aside>
  );
}
