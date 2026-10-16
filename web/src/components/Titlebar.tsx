import { ServerIcon } from "./ServerIcon.tsx";
import { useEffect, useRef } from "react";
import { environmentName, isRemote } from "../lib/environment.ts";
import { BranchIcon } from "./icons/git.tsx";
import { PanelLeftIcon, PanelRightIcon } from "./icons/squares.tsx";
import { MenuIcon } from "./icons/marks.tsx";
import { ComposeIcon } from "./icons/pencil.tsx";
import { toggleBotPanel, toggleInspector, useApp } from "../lib/store.ts";
import { MOD } from "../lib/modifier-key.ts";
import type { AppState } from "../lib/app-state.ts";
import { BotAvatar } from "./bots/BotAvatar.tsx";
import { botMood, workingLine } from "../lib/roster.ts";
import { GroupAvatar } from "./bots/GroupAvatar.tsx";
import { useGroupMembers } from "./bots/use-group-members.ts";
import { createChat, createThread } from "../lib/actions.ts";
import { WindowControls } from "./WindowControls.tsx";
import { ThreadTabs } from "./ThreadTabs.tsx";
import { ThreadDetailsButton } from "./thread-details/ThreadDetails.tsx";

/** Render workspace navigation using branch metadata scoped to the selected checkout. */
export function Titlebar({
  view,
  sidebarOpen,
  sidebarToggle,
  onToggleSidebar,
}: {
  view: AppState["activeView"];
  sidebarOpen: boolean;
  sidebarToggle: boolean;
  onToggleSidebar: () => void;
}) {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const activeThreadId = useApp((state) => state.activeThreadId);
  const thread = useApp((state) =>
    activeThreadId ? state.threads[activeThreadId] : undefined,
  );
  const inspectorOpen = useApp((state) => state.inspectorOpen);
  const bot = useApp((state) => state.bots[state.activeRosterId ?? ""]);
  const group = useApp((state) => state.botGroups[state.activeRosterId ?? ""]);
  const members = useGroupMembers(group);
  const botPanelOpen = useApp((state) => state.botPanelOpen);
  const panelActivity = useApp((state) => state.panels.some((panel) => panel.projectId === state.activeProjectId && state.unseenPanels[panel.id]));
  const canCreateThread = useApp((state) => state.connected && !state.creatingThread && (view === "chats" || Boolean(state.activeProjectId)));
  const conversationView = view === "chat" || view === "chats";
  const newLabel = view === "chats" ? "New chat" : "New thread";

  const project = projects.find((entry) => entry.id === activeProjectId);
  // The project-level Git cache can still describe a previously selected worktree.
  // The Git monitor refreshes this checkout-specific metadata for the sidebar too.
  const onProjectCheckout = !thread?.workspacePath || thread.workspacePath === project?.path;
  const branch = thread
    ? thread.workspaceBranch ?? (onProjectCheckout ? project?.branch : undefined)
    : project?.branch;
  const workspaceContext = isRemote();
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = header.current;
    const report = window.citropyDesktop?.titlebarHeight;
    if (!element || !report) return;
    let last = 0;
    const observer = new ResizeObserver(() => {
      const height = element.getBoundingClientRect().height;
      if (height > 0 && height !== last) {
        last = height;
        report(height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={header} className="topbar" data-desktop={Boolean(window.citropyDesktop)}>
      <div className="topbar-left">
        <div className="topbar-start">
          {sidebarToggle && <button
            className="icon-btn sidebar-toggle"
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <PanelLeftIcon size={15} className="sidebar-toggle-panel" />
            <MenuIcon size={20} className="sidebar-toggle-menu" />
          </button>}
        </div>
      </div>
      <nav
        className="topbar-center breadcrumb"
        data-view={view}
        aria-label="Current workspace and view"
      >
        {conversationView && <ThreadTabs chats={view === "chats"} />}
        {workspaceContext && <div className="workspace-breadcrumb">
          {isRemote() && <span className="environment-breadcrumb" title={environmentName()}><ServerIcon size={13} /><span className="truncate">{environmentName()}</span></span>}
        </div>}
        {conversationView && thread && (
          <>
            {workspaceContext && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
            <span className="thread-title truncate">{thread.title}</span>
          </>
        )}
        {view === "bots" && bot && (
          <span className="bot-heading">
            <BotAvatar bot={bot} size={22} mood={botMood(thread)} />
            <span className="thread-title truncate">{bot.name}</span>
            {bot.title && <span className="topbar-subtitle"><span className="truncate">{bot.title}</span></span>}
          </span>
        )}
        {view === "bots" && group && (
          <span className="bot-heading">
            <GroupAvatar group={group} size={22} />
            <span className="thread-title truncate">{group.name}</span>
            <span className="topbar-subtitle"><span className="truncate">
              {group.working.length ? workingLine(members.filter((member) => group.working.includes(member.id)).map((member) => member.name)) : `${members.length} bots`}
            </span></span>
          </span>
        )}
        {view === "chat" && project && <span className="topbar-subtitle">
          <span className="truncate">{project.name}</span>
          {branch && <><BranchIcon size={11} /><span className="truncate">{branch}</span></>}
        </span>}
      </nav>

      <div className="topbar-right">
        {view === "chat" && <ThreadDetailsButton />}
        {conversationView && (
          <button
            className="icon-btn topbar-new-thread"
            type="button"
            onClick={() => void (view === "chats" ? createChat() : createThread())}
            disabled={!canCreateThread}
            aria-label={newLabel}
            title={newLabel}
          >
            <ComposeIcon size={17} />
          </button>
        )}
        {(view === "chat" || (view === "chats" && thread)) && (
          <button
            className="icon-btn inspector-toggle"
            type="button"
            onClick={toggleInspector}
            data-active={inspectorOpen}
            aria-expanded={inspectorOpen}
            aria-label="Toggle inspector"
            title="Toggle inspector"
          >
            <span className="unseen-anchor">
              <PanelRightIcon size={16} />
              {panelActivity && <span className="unseen-dot" aria-label="New panel activity" />}
            </span>
          </button>
        )}
        {view === "bots" && (bot || group) && (
          <button
            className="icon-btn inspector-toggle"
            type="button"
            onClick={toggleBotPanel}
            data-active={botPanelOpen}
            aria-expanded={botPanelOpen}
            aria-label="Toggle details panel"
            title={`Toggle details panel (${MOD}Shift+,)`}
          >
            <PanelRightIcon size={16} />
          </button>
        )}
      </div>
      {window.citropyDesktop && <WindowControls />}
    </header>
  );
}
