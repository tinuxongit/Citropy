import { useEffect, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence } from "motion/react";
import { closeProject, confirmRemoveProjects, createThread, openOnEnvironment } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import { opensContextMenu } from "../../lib/context-menu-key.ts";
import { connectionName, environmentId, useEnvironments } from "../../lib/environment.ts";
import { selectProject, useApp } from "../../lib/store.ts";
import { FolderIcon, FolderOpenIcon } from "../icons/folders.tsx";
import { NewMessageIcon } from "../icons/messages.tsx";
import { EditIcon } from "../icons/pencil.tsx";
import { MoreIcon } from "../icons/marks.tsx";
import { TrashIcon } from "../icons/actions.tsx";
import { ForkIcon } from "../icons/git.tsx";
import { Menu } from "../Menu.tsx";
import { Loader } from "../Loader.tsx";
import { RenameProjectModal } from "./RenameProjectModal.tsx";
import type { Project } from "../../../../shared/protocol.ts";
import { DisconnectedIcon } from "../icons/hardware.tsx";
import type { ThreadGroup } from "./thread-groups.ts";
import { WorkspaceMenu, type WorkspaceDialog } from "../WorkspaceSelector.tsx";

export function ProjectHeading({ group, project, searching, picked, canCreateThread, onDragStart, consumeDrag, onNewThread, onConversation }: {
  group: ThreadGroup;
  project: Project;
  searching: boolean;
  picked: boolean;
  canCreateThread: boolean;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  consumeDrag: (event: MouseEvent) => boolean;
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
    if (!await confirmRemoveProjects([project.name])) return;
    setPending(true);
    try { await closeProject(project.id, environment); }
    catch (error) { reportError(error); }
    finally { setPending(false); }
  };
  const openMenu = (element: HTMLElement) => {
    const button = element.querySelector<HTMLButtonElement>(".global-project-more");
    if (button?.getAttribute("aria-expanded") !== "true") button?.click();
  };
  const moreLabel = `Organize ${group.label}`;
  const Icon = group.icon === FolderIcon && expanded ? FolderOpenIcon : group.icon;
  const newThreadLabel = `New thread · ${group.label}`;
  const disabled = pending || connecting || (current && !connected && !window.citropyDesktop?.connectEnvironment);

  return <>
    <div className="global-project-heading" data-project-id={project.id} data-environment={environment} data-drag-id={group.id} data-active={current && project.id === activeProjectId} data-picked={picked}
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
        {pending || connecting ? <Loader size={16} /> : <Icon size={16} />}
        <span className="truncate">{group.label}</span>
        {group.offline && <span className="global-project-offline" title="Disconnected"><DisconnectedIcon size={14} /></span>}
      </button>
      <Menu align="end" span=".global-project-heading" edge=".rail" items={[
        { id: "open", label: "Open workspace", icon: <FolderOpenIcon size={15} />, disabled, onSelect: () => void run(() => { selectProject(project.id); onConversation(); }) },
        ...(project.isGit ? [{ id: "new-worktree", label: "New thread with workspace options…", icon: <ForkIcon size={15} />, disabled: disabled || !canCreateThread, onSelect: () => void run(() => { selectProject(project.id); onConversation(); void createThread(undefined, true); }) }] : []),
        { id: "rename", label: "Rename project", icon: <EditIcon size={15} />, disabled, onSelect: () => void run(() => setRenaming(true)) },
        { id: "remove", label: "Remove project", icon: <TrashIcon size={15} />, danger: true, disabled, onSelect: () => void remove() },
      ]} trigger={({ id, open, toggle }) => (
        <button id={id} className="global-project-more" type="button" aria-label={moreLabel} title={moreLabel} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><MoreIcon size={16} /></button>
      )} />
      <button className="global-project-new" type="button" aria-label={newThreadLabel} title={newThreadLabel} disabled={disabled || !canCreateThread} onClick={onNewThread}><NewMessageIcon size={14} /></button>
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
