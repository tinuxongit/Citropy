import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { hasUsableAccount } from "../../../shared/provider-account.ts";
import { createThread, openOnEnvironment, reorderThreads } from "../lib/actions.ts";
import { reportError } from "../lib/api.ts";
import { environmentId, useEnvironments, useWorkspaceCatalog } from "../lib/environment.ts";
import { environmentSlice, useBackgroundEnvironments } from "../lib/live-environments.ts";
import { scaled, selectProject, useApp } from "../lib/store.ts";
import { useVisibleInterval } from "../lib/use-visible-interval.ts";
import { Collapsible } from "./Collapsible.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { MessageSquarePlus } from "./icons.ts";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { ThreadPreview } from "./ThreadPreview.tsx";
import { canConnectServers, WorkspaceDialogs, type WorkspaceDialog, type WorkspaceScope } from "./WorkspaceSelector.tsx";
import { CachedThreadRow } from "./sidebar/CachedThreadRow.tsx";
import { ProjectHeading, SectionHeading, StatusHeading } from "./sidebar/GroupHeadings.tsx";
import { movableSiblings, shownThreads, threadKey, threadOrderAfterMove, useThreadGroups, type EnvironmentFolders, type SidebarThread, type ThreadGroup } from "./sidebar/thread-groups.ts";
import { ThreadRow } from "./sidebar/ThreadRow.tsx";
import { useProjectDrag } from "./sidebar/use-project-drag.ts";
import { useProjectOrder, type DropEdge } from "./sidebar/use-project-order.ts";
import { useThreadDrag } from "./sidebar/use-thread-drag.ts";
import { useThreadPreview } from "./sidebar/use-thread-preview.ts";
import { useThreadSearch } from "./sidebar/use-thread-search.ts";
import { ThreadSearch } from "./sidebar/ThreadSearch.tsx";
import { rootThread, useThreadTree, type ThreadTree } from "./sidebar/use-thread-tree.ts";

const VIRTUALIZE_AFTER_THREADS = 150;
const ROW_TIME_REFRESH_MS = 60_000;
const EMPTY_TREE: ThreadTree = { childrenByParent: new Map(), selectedPath: new Set(), activePaths: new Set() };

function estimateRowHeight(row: { item?: SidebarThread; empty: boolean } | undefined): number {
  if (row?.item) return 30;
  if (row?.empty) return 36;
  return 38;
}

export function Sidebar({ onConversation }: { onConversation: () => void }) {
  const threadMap = useApp((state) => state.threads);
  const order = useApp((state) => state.threadOrder);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const activeThreadId = useApp((state) => state.activeThreadId);
  const providers = useApp((state) => state.providers);
  const projects = useApp((state) => state.projects);
  const connected = useApp((state) => state.connected);
  const creatingThread = useApp((state) => state.creatingThread);
  const uiScale = useApp((state) => state.uiScale);
  const { activeId: environment, connections } = useEnvironments();
  const background = useBackgroundEnvironments();
  const catalog = useWorkspaceCatalog();
  const query = useApp((state) => state.threadQuery);
  const [focusedRow, setFocusedRow] = useState<string>();
  const [dialog, setDialog] = useState<WorkspaceDialog>();
  const [now, setNow] = useState(Date.now);
  useVisibleInterval(() => setNow(Date.now()), ROW_TIME_REFRESH_MS);
  const sections = useMemo((): WorkspaceScope[] => canConnectServers() ? ["local", "servers"] : ["local"], []);
  const viewport = useRef<HTMLDivElement>(null);
  const threadList = useRef<HTMLDivElement>(null);
  useEffect(() => useApp.setState({ threadQuery: "" }), [activeProjectId, environment]);
  useEffect(() => { setFocusedRow(undefined); }, [environment]);

  const matches = useThreadSearch(query);
  const threadsByEnvironment = useMemo(() => Object.fromEntries([
    [environment, threadMap],
    ...Object.entries(background).filter(([, slice]) => slice.connected).map(([id, slice]) => [id, slice.threads]),
  ] as [string, Record<string, ThreadMeta>][]), [environment, threadMap, background]);
  const threads = useMemo((): SidebarThread[] => {
    if (query.trim()) return (matches ?? []).flatMap((match): SidebarThread[] => {
      const thread = threadsByEnvironment[match.environment]?.[match.threadId];
      return thread ? [{ thread, environment: match.environment }] : [];
    });
    return Object.entries(threadsByEnvironment).filter(([id]) => id !== environment || connected).flatMap(([id, map]): SidebarThread[] => {
      const ids = id === environment ? order : background[id]!.threadOrder;
      return ids.flatMap((threadId): SidebarThread[] => map[threadId] ? [{ thread: map[threadId]!, environment: id }] : []);
    });
  }, [query, matches, environment, connected, threadsByEnvironment, order, background]);
  const activeRoot = rootThread(threadMap, activeThreadId);
  const projectSets = useMemo(() => Object.fromEntries(["local", ...connections.map(connection => connection.id)].map(id =>
    [id, id === environment && connected ? projects : background[id]?.connected ? background[id].projects : catalog[id]?.projects ?? []],
  )), [environment, connections, connected, projects, background, catalog]);
  const { orderedProjects, moveProject, moveProjectBy } = useProjectOrder(projectSets);
  const environments = useMemo(() => ["local", ...connections.map((connection) => connection.id)].flatMap((id): EnvironmentFolders[] => {
    const live = id === environment ? connected : background[id]?.connected;
    if (!live && !catalog[id]?.projects.length) return [];
    return [{ environment: id, server: id !== "local", projects: orderedProjects[id] ?? [], cachedThreads: live ? undefined : catalog[id]?.threads ?? [] }];
  }), [environment, connections, connected, background, catalog, orderedProjects]);
  const { groups, rows, selected, revealFinished } = useThreadGroups({ threads, query, environments, sections, activeEnvironment: environment, activeRoot, activeThreadId });
  const trees = useThreadTree(threadsByEnvironment, environment, activeThreadId);
  const rowOrder = useMemo(() => rows.map((row) => row.key).join("\0"), [rows]);
  const rowIndexes = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rowOrder]);

  const reorder = (targetEnvironment: string, source: string, target: string, edge?: DropEdge) => {
    const map = threadsByEnvironment[targetEnvironment];
    const projectId = map?.[source]?.projectId;
    if (source === target || query || !projectId) return;
    if (map?.[target]?.projectId !== projectId) return;
    const ids = threadOrderAfterMove(groups, targetEnvironment, projectId, source, target, edge);
    if (ids) void reorderThreads(projectId, ids, targetEnvironment).catch(reportError);
  };
  const moveThread = (item: SidebarThread, direction: number) => {
    const siblings = movableSiblings(groups, item);
    const next = siblings[siblings.findIndex((sibling) => sibling.thread.id === item.thread.id) + direction];
    if (next) reorder(item.environment, item.thread.id, next.thread.id);
  };

  const dragResetKey = [environment, activeProjectId, query, connected, uiScale, rowOrder].join("\n");
  const threadDrag = useThreadDrag({ viewport, groups, disabled: Boolean(query), resetKey: dragResetKey, onDrop: reorder });
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
  const handlers = useRef({ moveThread, revealFinished, onConversation });
  handlers.current = { moveThread, revealFinished, onConversation };
  const rowHandlers = useMemo(() => ({
    move: (item: SidebarThread, direction: number) => handlers.current.moveThread(item, direction),
    finished: () => handlers.current.revealFinished(),
    conversation: () => handlers.current.onConversation(),
  }), []);

  const virtualized = threads.length > VIRTUALIZE_AFTER_THREADS;
  const focusedIndex = focusedRow ? rowIndexes.get(focusedRow) ?? -1 : -1;
  const draggingIndex = threadDrag.draggingId ? rowIndexes.get(threadDrag.draggingId) ?? -1 : -1;
  const activeIndex = activeRoot ? rowIndexes.get(threadKey(environment, activeRoot.id)) ?? -1 : -1;
  const getItemKey = useMemo(() => {
    const keys = rows.map((row) => row.key);
    return (index: number) => keys[index]!;
  }, [rowOrder]);
  const list = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    enabled: virtualized,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: (index) => scaled(estimateRowHeight(rows[index])),
    measureElement: (element) => element.offsetHeight,
    overscan: 3,
    rangeExtractor: useCallback((range: Range) => [...new Set([
      ...defaultRangeExtractor(range),
      ...[focusedIndex, draggingIndex, activeIndex].filter((index) => index >= 0),
    ])].sort((a, b) => a - b), [focusedIndex, draggingIndex, activeIndex]),
  });
  useEffect(() => {
    if (virtualized) list.measure();
  }, [uiScale, virtualized]);
  useEffect(() => {
    if (!virtualized) return;
    const child = viewport.current?.querySelector<HTMLElement>('.thread-child[data-active="true"]');
    if (child) { child.scrollIntoView({ block: "nearest" }); return; }
    const index = rows.findIndex((row) => row.item?.environment === environment && row.item.thread.id === activeRoot?.id);
    if (index >= 0) list.scrollToIndex(index, { align: "auto" });
  }, [activeThreadId, activeProjectId, query, virtualized]);

  const canCreateThread = connected && !creatingThread && providers.some(hasUsableAccount);
  const canCreateIn = (group: ThreadGroup) => {
    const target = group.environment ?? environment;
    if (target === environment) return canCreateThread;
    const slice = environmentSlice(target);
    return !slice || (slice.connected && !slice.creatingThread && slice.providers.some(hasUsableAccount));
  };
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
    <button className="global-project-empty" type="button" disabled={!canCreateIn(group)} onClick={() => startThread(group)}>
      <MessageSquarePlus size={14} aria-hidden="true" />
      Start a conversation
    </button>
  );

  const renderHeading = (group: ThreadGroup) => {
    const searching = Boolean(query);
    const project = group.project;
    if (group.heading === "section") return <SectionHeading group={group} searching={searching} onDialog={setDialog} />;
    if (project) return <ProjectHeading
      group={group}
      project={project}
      searching={searching}
      dragging={projectDrag.dragging === group.id}
      isFirst={orderedProjects[group.environment!]?.[0]?.id === project.id}
      isLast={orderedProjects[group.environment!]?.at(-1)?.id === project.id}
      canCreateThread={canCreateIn(group)}
      onDragStart={(event) => projectDrag.start(event, group.id)}
      consumeDrag={projectDrag.consumeDrag}
      onMove={(direction) => moveProjectBy(group.environment!, project.id, direction)}
      onNewThread={() => startThread(group)}
      onConversation={onConversation}
    />;
    return <StatusHeading group={group} searching={searching} />;
  };

  const renderThread = (item: SidebarThread & { thread: ThreadMeta; cached?: false }) => <ThreadRow
    key={threadKey(item.environment, item.thread.id)}
    thread={item.thread}
    environment={item.environment}
    now={now}
    query={query}
    match={matches?.find((result) => result.environment === item.environment && result.threadId === item.thread.id)}
    drag={threadDrag}
    preview={preview.controls}
    describedBy={preview.describedBy(item.environment, item.thread.id)}
    tree={trees[item.environment]!.childrenByParent.has(item.thread.id) ? trees[item.environment]! : EMPTY_TREE}
    onMove={rowHandlers.move}
    onFinished={rowHandlers.finished}
    onConversation={rowHandlers.conversation}
  />;
  const renderItem = (item: SidebarThread, group: ThreadGroup) => item.cached
    ? <CachedThreadRow thread={item.thread} now={now} environment={item.environment} showDisconnected={!group.offline} onConversation={onConversation} />
    : renderThread(item);

  const renderGroup = (group: ThreadGroup) => {
    const shown = shownThreads(group, Boolean(query), selected);
    if (virtualized) return list.getVirtualItems().filter((item) => rows[item.index]?.group.id === group.id).map((item) => {
      const row = rows[item.index]!;
      return <div key={item.key} data-index={item.index} ref={list.measureElement} className="thread-list-item" style={{ position: "absolute", top: item.start, left: 0, width: "100%" }}>
        {row.item ? renderItem(row.item, group) : row.empty ? renderEmpty(group) : renderHeading(group)}
      </div>;
    });
    return <>
      {renderHeading(group)}
      {group.threads.map((item) => <Collapsible key={threadKey(item.environment, item.thread.id)} open={shown.includes(item)} className="thread-category-content">
        <div className="thread-list-item">{renderItem(item, group)}</div>
      </Collapsible>)}
      {group.project && !query && !group.threads.length && <Collapsible open={group.open} className="thread-category-content">
        <div className="thread-list-item">{renderEmpty(group)}</div>
      </Collapsible>}
    </>;
  };

  const renderCategory = (group: ThreadGroup) => <section className="thread-category" data-category={group.id} data-tree={group.project ? "" : undefined} key={group.id} style={virtualized ? { display: "contents" } : undefined}>
    {renderGroup(group)}
  </section>;

  const emptyMessage = !query
    ? "Your conversations will appear here."
    : !connected && !Object.values(background).some((slice) => slice.connected)
      ? "Reconnect to search conversations."
      : !matches
        ? "Searching…"
        : "No matching conversations.";

  return (
    <aside className="rail" aria-label="Conversations">
      <div className="thread-toolbar"><ThreadSearch /></div>
      <div className="rail-scroll">
        <div className="rail-list scroll" ref={viewport}
          onScroll={(event) => {
            preview.controls.hide();
            event.currentTarget.parentElement?.toggleAttribute("data-scrolled", event.currentTarget.scrollTop > 0);
          }}
          onFocusCapture={(event) => {
            const index = event.target.closest<HTMLElement>(".thread-list-item[data-index]")?.dataset.index;
            if (index !== undefined) setFocusedRow(rows[Number(index)]?.key);
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(undefined);
          }}
        >
          <div className="thread-list sliding-selection" ref={threadList} data-virtualized={virtualized} data-dragging={Boolean(threadDrag.draggingId)} style={virtualized ? { height: list.getTotalSize(), position: "relative" } : undefined}>
            <SelectionHighlight value={activeThreadId ? threadKey(environment, activeThreadId) : undefined} layout={rowOrder} selector='.thread-card[data-active="true"]' />
            {virtualized ? groups.map(renderCategory) : groups.filter((group) => !group.parent).map((group) => group.section ? [
              renderCategory(group),
              <Collapsible key={`${group.id}:content`} open={group.open} className="rail-section-content">{groups.filter((child) => child.parent === group.id).map(renderCategory)}</Collapsible>,
            ] : renderCategory(group))}
            {projectDrag.drop && <div className="project-drop-line" style={{ top: projectDrag.drop.top }} />}
          </div>
          {threads.length === 0 && (query || groups.length === 0) && <div className="rail-empty">{emptyMessage}</div>}
        </div>
      </div>
      {preview.shown && threadsByEnvironment[preview.shown.environment]?.[preview.shown.threadId] && <ThreadPreview
        id={preview.id}
        thread={threadsByEnvironment[preview.shown.environment]![preview.shown.threadId]!}
        environment={preview.shown.environment}
        anchor={preview.shown.anchor}
        onClose={preview.controls.hide}
        onPointerEnter={preview.controls.clearTimer}
        onPointerLeave={preview.controls.leave}
      />}
      <WorkspaceDialogs dialog={dialog} onClose={() => setDialog(undefined)} />
      <ResizeHandle panel="sidebar" />
    </aside>
  );
}
