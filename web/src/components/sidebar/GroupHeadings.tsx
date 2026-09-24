import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { closeProject, createThread, openOnEnvironment } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import { connectionName, environmentId, useEnvironments } from "../../lib/environment.ts";
import { useI18n } from "../../lib/i18n.ts";
import { confirmAction, useApp } from "../../lib/store.ts";
import { ChevronRight, Folder, FolderOpen, MessageSquarePlus, Pencil, Trash2 } from "../icons.ts";
import { Menu } from "../Menu.tsx";
import { PixelLoader } from "../PixelLoader.tsx";
import type { Project } from "../../../../shared/protocol.ts";
import type { ThreadGroup } from "./thread-groups.ts";

export function ProjectHeading({ group, project, searching, dragging, isFirst, isLast, canCreateThread, onDragStart, consumeDrag, onMove, onRename, onNewThread }: {
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
  onRename: () => void;
  onNewThread: () => void;
}) {
  const t = useI18n();
  const connected = useApp((state) => state.connected);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const expanded = group.open || searching;
  const remove = async () => {
    const confirmed = await confirmAction({
      title: t("Remove project?"),
      description: t("Remove {name} and its conversations from Citropy? Files stay on disk.", { name: project.name }),
      label: t("Remove project"),
      danger: true,
    });
    if (confirmed) closeProject(project.id);
  };
  const editLabel = `${t("Edit project")} ${group.label}`;
  const Icon = group.icon === Folder && expanded ? FolderOpen : group.icon;
  const newThreadLabel = `${t("New thread")} · ${group.label}`;

  return (
    <div className="global-project-heading" data-project-id={project.id} data-active={project.id === activeProjectId} data-dragging={dragging}>
      <button
        className="global-project-toggle"
        type="button"
        aria-label={`${group.open ? t("Collapse") : t("Expand")} ${group.label}`}
        aria-expanded={expanded}
        title={project.path}
        onPointerDown={onDragStart}
        onClick={(event) => { if (!consumeDrag(event)) group.toggle(); }}
      >
        <Icon size={15} />
        <span className="truncate">{group.label}</span>
        {!expanded && group.threads.length > 0 && <span className="global-project-count">{group.threads.length}</span>}
      </button>
      <Menu
        align="end"
        items={[
          { id: "rename", label: t("Rename project"), icon: <Pencil size={15} />, disabled: !connected, onSelect: onRename },
          { id: "up", label: t("Move up"), disabled: isFirst, onSelect: () => onMove(-1) },
          { id: "down", label: t("Move down"), disabled: isLast, onSelect: () => onMove(1) },
          { id: "remove", label: t("Remove project"), icon: <Trash2 size={15} />, danger: true, disabled: !connected, onSelect: () => void remove() },
        ]}
        trigger={({ id, open, toggle }) => (
          <button id={id} className="global-project-edit" type="button" aria-label={editLabel} title={editLabel} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
            <Pencil size={13} />
          </button>
        )}
      />
      <button className="global-project-new" type="button" aria-label={newThreadLabel} title={newThreadLabel} disabled={!canCreateThread} onClick={onNewThread}>
        <MessageSquarePlus size={14} />
      </button>
    </div>
  );
}

export function CachedProjectHeading({ group, environment, project, onConversation }: {
  group: ThreadGroup;
  environment: string;
  project: Project;
  onConversation: () => void;
}) {
  const t = useI18n();
  const connecting = useEnvironments().connections.some((entry) => entry.id === environment && entry.status === "connecting");
  const count = group.cachedThreads?.length ?? 0;
  const Icon = group.icon === Folder && group.open ? FolderOpen : group.icon;
  const newThreadLabel = `${t("New thread")} · ${group.label}`;
  const startThread = () => {
    onConversation();
    void openOnEnvironment(environment, project.id).then(() => { if (environmentId() === environment) return createThread(); }).catch(reportError);
  };

  return (
    <div className="global-project-heading" data-project-id={project.id} data-environment={environment}>
      <button
        className="global-project-toggle"
        type="button"
        aria-label={`${group.open ? t("Collapse") : t("Expand")} ${group.label}`}
        aria-expanded={group.open}
        title={environment === "local" ? project.path : `${connectionName(environment)}: ${project.path}`}
        onClick={group.toggle}
      >
        {connecting ? <PixelLoader size={15} /> : <Icon size={15} />}
        <span className="truncate">{group.label}</span>
        {!group.open && count > 0 && <span className="global-project-count">{count}</span>}
      </button>
      <button className="global-project-new" type="button" aria-label={newThreadLabel} title={newThreadLabel} disabled={connecting} onClick={startThread}>
        <MessageSquarePlus size={14} />
      </button>
    </div>
  );
}

export function StatusHeading({ group, searching }: { group: ThreadGroup; searching: boolean }) {
  const t = useI18n();
  const label = t(group.label, undefined, "conversations");
  const expanded = group.open || searching;
  return (
    <div className={`global-project-heading global-status-heading global-${group.id}-heading`}>
      <button className="global-project-toggle" type="button" aria-label={`${group.open ? t("Collapse") : t("Expand")} ${label}`} aria-expanded={expanded} onClick={group.toggle}>
        <group.icon size={15} />
        <span className="truncate">{label}</span>
        {!expanded && <span className="global-project-count">{group.threads.length}</span>}
      </button>
    </div>
  );
}

export function CategoryToggle({ group, searching }: { group: ThreadGroup; searching: boolean }) {
  const t = useI18n();
  return (
    <button className="finished-toggle" type="button" aria-expanded={group.open || searching} onClick={group.toggle}>
      <ChevronRight size={12} className="category-chevron" />
      <group.icon size={14} className={`category-icon${group.id === "finished" ? " category-finished" : ""}`} />
      <span>{t(group.label, undefined, "conversations")}</span>
      <span>{group.threads.length}</span>
    </button>
  );
}
