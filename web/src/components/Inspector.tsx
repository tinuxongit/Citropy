import { flushSync } from "react-dom";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { isRemote } from "../lib/environment.ts";
import { nextTabIndex } from "../lib/tab-strip.ts";
import { lazy, Suspense, type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GlobeIcon } from "./GlobeIcon.tsx";
import { TerminalIcon } from "./icons/squares.tsx";
import { FileDiffIcon, FilesIcon } from "./icons/files.tsx";
import { NetworkIcon, PlugIcon } from "./icons/hardware.tsx";
import { CloseIcon, MoreIcon, PlusIcon } from "./icons/marks.tsx";
import { CollapseIcon, ExpandIcon } from "./icons/media.tsx";
import { PenNibIcon } from "./icons/drawing.tsx";
import { NotebookPenIcon } from "./icons/pencil.tsx";
import { Changes } from "./Changes.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { FileTree } from "./FileTree.tsx";
import { TerminalPane } from "./TerminalPane.tsx";
import { BrowserPane } from "./BrowserPane.tsx";
import { SubagentsPane } from "./SubagentsPane.tsx";
import { ToolsPane } from "./ToolsPane.tsx";
import { Menu } from "./Menu.tsx";
import { usePanelTabActions } from "./use-panel-tab-actions.tsx";
import { scaled, selectPanel, useApp } from "../lib/store.ts";
import { openWorkbenchPanel } from "../lib/actions.ts";
import { send } from "../lib/socket.ts";
import type { PanelKind } from "../../../shared/workbench.ts";

const TAB_MIN_WIDTH = 80;

const DrawingPane = lazy(() => import("./drawing/DrawingPane.tsx").then(module => ({ default: module.DrawingPane })));
const NotesPane = lazy(() => import("./notes/NotesPane.tsx").then(module => ({ default: module.NotesPane })));

const options = [
  {
    kind: "browser",
    label: "Browser",
    hint: "Browse together with your provider",
    icon: GlobeIcon,
  },
  {
    kind: "terminal",
    label: "Terminal",
    hint: "Open another shell",
    icon: TerminalIcon,
  },
  {
    kind: "files",
    label: "Files",
    hint: "Explore this workspace",
    icon: FilesIcon,
  },
  {
    kind: "changes",
    label: "Changes",
    hint: "Review the working tree",
    icon: FileDiffIcon,
  },
  {
    kind: "subagents",
    label: "Subagents",
    hint: "Follow delegated work",
    icon: NetworkIcon,
  },
  {
    kind: "tools",
    label: "Tools",
    hint: "MCP connection and available tools",
    icon: PlugIcon,
  },
  {
    kind: "drawing",
    label: "Drawing",
    hint: "Sketch an idea and attach it to a message",
    icon: PenNibIcon,
  },
  {
    kind: "notes",
    label: "Notes",
    hint: "Write notes and attach them to a message",
    icon: NotebookPenIcon,
  },
] satisfies Array<{
  kind: PanelKind;
  label: string;
  hint: string;
  icon: typeof PlusIcon;
}>;

export function Inspector({ visible }: { visible: boolean }) {
  const projectId = useApp((state) => state.activeProjectId);
  const threadId = useApp((state) => state.activeThreadId);
  const panels = useApp((state) => state.panels);
  const activePanels = useApp((state) => state.activePanels);
  const unseenPanels = useApp((state) => state.unseenPanels);
  const connected = useApp((state) => state.connected);
  const tabStrip = useRef<HTMLDivElement>(null);
  const focusTab = useRef(false);
  const [expandedProject, setExpandedProject] = useState<string>();
  const expanded = Boolean(projectId && expandedProject === projectId);
  const inspector = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const toggleExpanded = () => {
    const panel = inspector.current?.parentElement;
    const before = panel?.getBoundingClientRect();
    flushSync(() => setExpandedProject(expanded ? undefined : projectId ?? undefined));
    if (!panel || !before || reducedMotion) return;
    const after = panel.getBoundingClientRect();
    const timing = { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };
    if (expanded) panel.animate([{ transform: "translateX(-40px)", opacity: 0.6 }, { transform: "none", opacity: 1 }], timing);
    else panel.animate([{ transform: `translateX(${before.left - after.left}px)` }, { transform: "none" }], timing);
  };
  const [tabCapacity, setTabCapacity] = useState<number | null>(null);
  const [overflowCapacity, setOverflowCapacity] = useState(1);
  const tabs = panels.filter((panel) => panel.projectId === projectId);
  const tabActions = usePanelTabActions(tabs, tabStrip, visible);
  const activeId =
    projectId && tabs.some((panel) => panel.id === activePanels[projectId])
      ? activePanels[projectId]
      : tabs[0]?.id;
  const tabGap = scaled(4);
  const tabSpan = scaled(TAB_MIN_WIDTH) + tabGap;
  const overflowButton = scaled(30);
  const tabLimit = tabCapacity !== null && tabs.length > tabCapacity ? overflowCapacity : tabs.length;
  const visibleTabs = tabs.slice(0, tabLimit);
  const selectedTab = tabs.find(panel => panel.id === activeId);
  if (selectedTab && !visibleTabs.includes(selectedTab)) visibleTabs[visibleTabs.length - 1] = selectedTab;
  const hiddenTabs = tabs.filter(panel => !visibleTabs.includes(panel));

  useEffect(() => {
    if (!visible || !activeId || !unseenPanels[activeId]) return;
    useApp.setState((state) => {
      const { [activeId]: seen, ...unseen } = state.unseenPanels;
      void seen;
      return { unseenPanels: unseen };
    });
  }, [visible, activeId, unseenPanels]);

  useLayoutEffect(() => {
    if (!visible || !tabStrip.current) return;
    const element = tabStrip.current;
    const measure = (width: number) => {
      setTabCapacity(width > 0 ? Math.floor((width + tabGap) / tabSpan) : null);
      setOverflowCapacity(Math.max(1, Math.floor((width - overflowButton) / tabSpan)));
    };
    const style = getComputedStyle(element);
    measure(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) flushSync(() => measure(Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, tabGap, tabSpan, overflowButton]);

  useLayoutEffect(() => {
    if (visible && activeId && focusTab.current) {
      document.getElementById(`panel-tab-${activeId}`)?.focus({ preventScroll: true });
      focusTab.current = false;
    }
  }, [visible, activeId]);

  return (
    <aside
      ref={inspector}
      className="inspector workbench"
      data-visible={visible}
      data-expanded={expanded}
      aria-label="Workspace panels"
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded && event.target === event.currentTarget)
          toggleExpanded();
      }}
    >
      {tabActions.overlays}
      <div className="workbench-heading">
        <div
          className="workbench-tabs sliding-selection"
          ref={tabStrip}
          role="tablist"
          aria-label="Open workspace panels"
          style={{ "--workbench-tab-min": `${TAB_MIN_WIDTH}px` } as CSSProperties}
          onKeyDown={(event) => {
            if (!(event.target instanceof HTMLElement) || !event.target.closest('[role="tab"]')) return;
            const focused = event.target.closest('[role="tab"]')?.id;
            const index = tabs.findIndex((panel) => `panel-tab-${panel.id}` === focused);
            const next = nextTabIndex(event.key, index, tabs.length);
            if (next === undefined) return;
            event.preventDefault();
            const panel = tabs[next];
            if (panel) {
              focusTab.current = panel.id !== activeId;
              selectPanel(panel.id);
              document.getElementById(`panel-tab-${panel.id}`)?.focus({ preventScroll: true });
            }
          }}
        >
          <SelectionHighlight value={`${activeId}:${visibleTabs.map((panel) => panel.id).join(",")}`} selector='.workbench-tab[data-active="true"]' />
          {tabActions.indicator}
          {visibleTabs.map((panel) => {
            const Icon = options.find(
              (option) => option.kind === panel.kind,
            )!.icon;
            const title = panel.title;
            return (
              <div
                className="workbench-tab"
                key={panel.id}
                data-active={activeId === panel.id}
                data-unseen={unseenPanels[panel.id] || undefined}
                {...tabActions.tabProps(panel)}
              >
                <button
                  type="button"
                  id={`panel-tab-${panel.id}`}
                  role="tab"
                  aria-label={title}
                  aria-selected={activeId === panel.id}
                  aria-controls={`panel-body-${panel.id}`}
                  aria-keyshortcuts={panel.kind === "terminal" ? "F2 Alt+ArrowLeft Alt+ArrowRight" : "Alt+ArrowLeft Alt+ArrowRight"}
                  tabIndex={activeId === panel.id ? 0 : -1}
                  title={title}
                  onClick={() => selectPanel(panel.id)}
                >
                  <span className="unseen-anchor">
                    <Icon size={14} className={`panel-icon-${panel.kind}`} />
                    {unseenPanels[panel.id] && <span className="unseen-dot" aria-label="New activity" />}
                  </span>
                  <span className="truncate">{title}</span>
                </button>
                <button
                  type="button"
                  className="workbench-close"
                  disabled={!connected}
                  aria-label={`Close ${title}`}
                  title={`Close ${title}`}
                  onClick={() => send({ t: "panel.close", id: panel.id })}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            );
          })}
          {hiddenTabs.length > 0 && <Menu
            header="Open workspace panels"
            align="end"
            width={300}
            items={hiddenTabs.map(panel => {
              const Icon = options.find(option => option.kind === panel.kind)!.icon;
              const title = panel.kind === "browser" || panel.kind === "terminal" ? panel.title : panel.title;
              return {
                id: panel.id,
                label: title,
                icon: <Icon size={16} className={`panel-icon-${panel.kind}`} />,
                onSelect: () => {
                  focusTab.current = true;
                  selectPanel(panel.id);
                },
                action: connected ? {
                  label: `Close ${title}`,
                  icon: <CloseIcon size={13} />,
                  onSelect: () => send({ t: "panel.close", id: panel.id }),
                } : undefined,
              };
            })}
            trigger={({ id, open, toggle }) => (
              <button
                id={id}
                type="button"
                className="workbench-overflow"
                aria-label="More panels"
                title="More panels"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
              >
                <span className="unseen-anchor">
                  <MoreIcon size={16} />
                  {hiddenTabs.some(panel => unseenPanels[panel.id]) && <span className="unseen-dot" aria-label="New activity" />}
                </span>
              </button>
            )}
          />}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={expanded ? "Restore workspace" : "Expand workspace"}
          title={expanded ? "Restore workspace" : "Expand workspace"}
          aria-pressed={expanded}
          disabled={!projectId}
          onClick={toggleExpanded}
        >
          {expanded ? <CollapseIcon size={15} /> : <ExpandIcon size={15} />}
        </button>
        <Menu
          header="Open a panel"
          className="workbench-panel-menu"
          width={292}
          align="end"
          items={options.filter(option => !isRemote() || option.kind !== "browser").map((option) => ({
            id: option.kind,
            label: option.label,
            hint: option.hint,
            icon: (
              <option.icon size={17} className={`panel-icon-${option.kind}`} />
            ),
            onSelect: () => openWorkbenchPanel(option.kind),
          }))}
          trigger={({ id, open, toggle }) => (
            <button
              id={id}
              className="workbench-open"
              type="button"
              onClick={toggle}
              disabled={!connected}
              aria-label="Open panel"
              title="Open panel"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <PlusIcon size={17} />
            </button>
          )}
        />
      </div>
      <div className="inspector-body">
        {panels.toSorted((a, b) => a.id.localeCompare(b.id)).map((panel) => {
          const selected = panel.projectId === projectId && panel.id === activeId;
          const active = visible && selected;
          return (
            <div
              key={panel.id}
              id={`panel-body-${panel.id}`}
              className="inspector-pane"
              role="tabpanel"
              aria-labelledby={`panel-tab-${panel.id}`}
              data-show={selected}
            >
              {panel.kind === "browser" ? (
                <BrowserPane panel={panel} active={active} />
              ) : panel.kind === "terminal" ? (
                <TerminalPane panel={panel} active={active} />
              ) : panel.kind === "drawing" ? (
                <Suspense fallback={<div className="pane-empty" role="status">Loading…</div>}><DrawingPane projectId={panel.projectId} /></Suspense>
              ) : panel.kind === "notes" ? (
                <Suspense fallback={<div className="pane-empty" role="status">Loading…</div>}><NotesPane projectId={panel.projectId} /></Suspense>
              ) : panel.projectId !== projectId ? null : panel.kind ===
                "files" ? (
                <FileTree panelId={panel.id} active={active} />
              ) : panel.kind === "changes" ? (
                <Changes key={`${projectId}:${threadId}`} active={active} />
              ) : panel.kind === "subagents" ? (
                <SubagentsPane />
              ) : (
                <ToolsPane />
              )}
            </div>
          );
        })}
        {tabs.length === 0 && (
          <div className="workbench-empty">
            <p>Open files, a terminal, or a browser alongside the conversation.</p>
            <button
              type="button"
              className="btn"
              disabled={!connected}
              onClick={() => openWorkbenchPanel("files")}
            >
              <FilesIcon size={15} />Open files
            </button>
          </div>
        )}
      </div>
      <ResizeHandle panel="inspector" />
    </aside>
  );
}
