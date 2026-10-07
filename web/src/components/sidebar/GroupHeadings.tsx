import { useEffect, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence } from "motion/react";
import { closeProject, createThread, openOnEnvironment } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import { opensContextMenu } from "../../lib/context-menu-key.ts";
import { connectionName, environmentId, useEnvironments } from "../../lib/environment.ts";
import { confirmAction, selectProject, useApp } from "../../lib/store.ts";
import { Folder, FolderOpen, MessageSquarePlus, Pencil, Trash2 } from "../icons.ts";
import { GitFork } from "lucide-react";
import { Menu } from "../Menu.tsx";
import { PixelLoader } from "../PixelLoader.tsx";
import { ThreadPulse } from "../ThreadPulse.tsx";
import { threadActivity } from "../../lib/format.ts";
import { RenameProjectModal } from "./RenameProjectModal.tsx";
import type { Project } from "../../../../shared/protocol.ts";
import { DisconnectedIcon } from "../DisconnectedIcon.tsx";
import type { ThreadGroup } from "./thread-groups.ts";
import { WorkspaceMenu, type WorkspaceDialog } from "../WorkspaceSelector.tsx";

export function ProjectHeading({ group, project, searching, dragging, isFirst, isLast, canCreateThread, onDragStart, consumeDrag, onMove, onNewThread, onConversation }: {
  group: ThreadGroup;
  project: Project;
  searching: boolean;
  dragging: boolean;
  isFirst: boolean;
  isLast: boolean;
  canCreateThread: boolean;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  consumeDrag: (event: MouseEvent) => boolean;
  onMove: (direction: -1 | 1) => void;
  onNewThread: () => void;
  onConversation: () => void;
}) {
  const connected = useApp((state) => state.connected);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const environments = useEnvironments();
  const environment = group.environment ?? environments.activeId;
  const current = environment === environments.activeId;
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState(false);
  const connecting = environments.connections.some(entry => entry.id === environment && entry.status === "connecting");
  const expanded = group.open || searching;
  const activities = expanded ? [] : group.threads.flatMap((item) => item.cached ? [] : [threadActivity(item.thread)]).filter(({ status }) => ["queued", "thinking", "working", "awaiting"].includes(status));
  const activity = activities.find(({ status }) => status === "awaiting") ?? activities[0];
  useEffect(() => { if (!current) setRenaming(false); }, [current]);

  const run = async (action: () => void) => {
    setPending(true);
    try {
      if (!current || !connected) await openOnEnvironment(environment, project.id);
      if (environmentId() !== environment) return;
      if (!useApp.getState().projects.some(entry => entry.id === project.id)) throw new Error("This workspace is no longer open on that host.");
      action();
    } catch (error) { reportError(error); }
    finally { setPending(false); }
  };
  const remove = async () => {
    const confirmed = await confirmAction({
      title: "Remove project?",
      description: `Remove ${project.name} and its conversations from Citropy? Files stay on disk.`,
      label: "Remove project",
      danger: true,
    });
    if (!confirmed) return;
    setPending(true);
    try { await closeProject(project.id, environment); }
    catch (error) { reportError(error); }
    finally { setPending(false); }
  };
  const openMenu = (element: HTMLElement) => {
    const button = element.querySelector<HTMLButtonElement>(".global-project-edit");
    if (button?.getAttribute("aria-expanded") !== "true") button?.click();
  };
  const editLabel = `Edit project ${group.label}`;
  const Icon = group.icon === Folder && expanded ? FolderOpen : group.icon;
  const newThreadLabel = `New thread · ${group.label}`;
  const disabled = pending || connecting || (current && !connected && !window.citropyDesktop?.connectEnvironment);

  return <>
    <div className="global-project-heading" data-project-id={project.id} data-environment={environment} data-drag-id={group.id} data-active={current && project.id === activeProjectId} data-dragging={dragging}
      onContextMenu={event => {
        if ((event.target as HTMLElement).closest('[role="menu"], dialog')) return;
        event.preventDefault();
        openMenu(event.currentTarget);
      }}
      onKeyDown={event => {
        if (!opensContextMenu(event)) return;
        if ((event.target as HTMLElement).closest('[role="menu"], dialog')) return;
        event.preventDefault();
        openMenu(event.currentTarget);
      }}
    >
      <button className="global-project-toggle" type="button"
        aria-label={`${group.open ? "Collapse" : "Expand"} ${group.label}${group.offline ? `, Disconnected` : ""}`} aria-expanded={expanded}
        title={environment === "local" ? project.path : `${connectionName(environment)}: ${project.path}`}
        onPointerDown={onDragStart} onClick={event => { if (!consumeDrag(event)) group.toggle(); }}
      >
        {pending || connecting ? <PixelLoader size={16} /> : <Icon size={16} strokeWidth={1.75} />}
        <span className="truncate">{group.label}</span>
        {activity && <span className="thread-status" data-status={activity.status} role="img" aria-label={activity.label} title={activity.label}>
          <ThreadPulse status={activity.status} />
        </span>}
        {group.offline && <span className="global-project-offline" title="Disconnected"><DisconnectedIcon size={14} /></span>}
      </button>
      <Menu align="end" span=".global-project-heading" items={[
        { id: "open", label: "Open workspace", icon: <FolderOpen size={15} />, disabled, onSelect: () => void run(() => { selectProject(project.id); onConversation(); }) },
        ...(project.isGit ? [{ id: "new-worktree", label: "New thread with workspace options…", icon: <GitFork size={15} />, disabled: disabled || !canCreateThread, onSelect: () => void run(() => { selectProject(project.id); onConversation(); void createThread(undefined, true); }) }] : []),
        { id: "rename", label: "Rename project", icon: <Pencil size={15} />, disabled, onSelect: () => void run(() => setRenaming(true)) },
        { id: "up", label: "Move up", disabled: isFirst, onSelect: () => onMove(-1) },
        { id: "down", label: "Move down", disabled: isLast, onSelect: () => onMove(1) },
        { id: "remove", label: "Remove project", icon: <Trash2 size={15} />, danger: true, disabled, onSelect: () => void remove() },
      ]} trigger={({ id, open, toggle }) => (
        <button id={id} className="global-project-edit" type="button" aria-label={editLabel} title={editLabel} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Pencil size={13} /></button>
      )} />
      <button className="global-project-new" type="button" aria-label={newThreadLabel} title={newThreadLabel} disabled={disabled || !canCreateThread} onClick={onNewThread}><MessageSquarePlus size={14} /></button>
    </div>
    <AnimatePresence>{renaming && current && <RenameProjectModal project={project} onClose={() => setRenaming(false)} />}</AnimatePresence>
  </>;
}

export function StatusHeading({ group, searching }: { group: ThreadGroup; searching: boolean }) {
  const label = group.label;
  const expanded = group.open || searching;
  return (
    <div className={`global-project-heading global-status-heading global-${group.id}-heading`}>
      <button className="global-project-toggle" type="button" aria-label={`${group.open ? "Collapse" : "Expand"} ${label}`} aria-expanded={expanded} onClick={group.toggle}>
        <group.icon size={15} />
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}

export function SectionHeading({ group, searching, onDialog }: { group: ThreadGroup; searching: boolean; onDialog: (dialog: WorkspaceDialog) => void }) {
  return (
    <div className="rail-section-heading">
      <button className="rail-section-toggle" type="button" aria-label={`${group.open ? "Collapse" : "Expand"} ${group.label}`} aria-expanded={group.open || searching} onClick={group.toggle}>
        <span className="truncate">{group.label}</span>
      </button>
      {group.section && <WorkspaceMenu scope={group.section} onDialog={onDialog} />}
    </div>
  );
}
