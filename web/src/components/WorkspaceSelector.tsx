import { ImportSessions } from "./ImportSessions.tsx";
import { AnimatePresence } from "motion/react";
import { BoxIcon } from "./icons/hardware.tsx";
import { FolderOpenIcon, FolderPlusIcon } from "./icons/folders.tsx";
import { DownloadIcon } from "./icons/arrows.tsx";
import { PlusIcon } from "./icons/marks.tsx";
import { TrashIcon } from "./icons/actions.tsx";
import { ServerIcon } from "./ServerIcon.tsx";
import { ContainerEnvironment } from "./ContainerEnvironment.tsx";
import { NewSshConnection } from "./EnvironmentSettings.tsx";
import { selectEnvironment, useEnvironments, useWorkspaceCatalog } from "../lib/environment.ts";
import { reportError } from "../lib/api.ts";
import { chooseWorkspaceOn, closeProject } from "../lib/actions.ts";
import { shortPath } from "../lib/format.ts";
import { confirmAction, selectProject, useApp } from "../lib/store.ts";
import type { Project } from "../../../shared/protocol.ts";
import { Menu, type MenuItem } from "./Menu.tsx";
import { Loader } from "./Loader.tsx";
import { connectionAddress, connectionStatus } from "./environments/environment-status.ts";

export type WorkspaceScope = "local" | "servers";
export type WorkspaceDialog = "import" | "container" | "ssh";

export const canConnectServers = () => Boolean(window.citropyDesktop?.connectEnvironment);

const SCOPE_LABELS: Record<WorkspaceScope, string> = { local: "Add local project", servers: "Add server project" };

export function WorkspaceMenu({ scope, onDialog }: { scope: WorkspaceScope; onDialog: (dialog: WorkspaceDialog) => void }) {
  const environments = useEnvironments();
  const catalog = useWorkspaceCatalog();
  const projects = useApp(state => state.projects);
  const activeProjectId = useApp(state => state.activeProjectId);
  const home = useApp(state => state.home);
  const choosing = useApp(state => state.choosingWorkspace);
  const remove = async (environment: string, entry: Project) => {
    const confirmed = await confirmAction({
      title: "Remove project?",
      description: `Remove ${entry.name} and its conversations from Citropy? Files stay on disk.`,
      label: "Remove project",
      danger: true,
    });
    if (confirmed) await closeProject(entry.id, environment).catch(reportError);
  };
  const group = (id: string): MenuItem[] => {
    const current = id === environments.activeId;
    const entries = current ? projects : catalog[id]?.projects ?? [];
    const root = current ? home : catalog[id]?.home ?? "";
    return [
      { id: `${id}:open`, label: "Open a folder…", icon: <FolderPlusIcon size={17} />, disabled: choosing, onSelect: () => { void chooseWorkspaceOn(id); } },
      ...entries.map(entry => ({
        id: `${id}:${entry.id}`, label: entry.name, hint: shortPath(entry.path, root),
        selected: current && entry.id === activeProjectId,
        icon: <FolderOpenIcon size={17} className="workspace-folder-icon" />,
        action: { label: `Remove project ${entry.name}`, icon: <TrashIcon size={14} />, onSelect: () => { void remove(id, entry); } },
        onSelect: () => {
          if (current) { if (entry.id !== activeProjectId) selectProject(entry.id); }
          else void selectEnvironment(id, entry.id).catch(reportError);
        },
      })),
    ];
  };
  const items: MenuItem[] = scope === "local" ? [
    ...group("local"),
    { id: "import-sessions", label: "Import conversations…", section: "Workspace actions", icon: <DownloadIcon size={17} />, onSelect: () => onDialog("import") },
  ] : [
    ...environments.connections.length === 1 ? group(environments.connections[0]!.id) : environments.connections.map(entry => ({
      id: `environment:${entry.id}`, label: entry.name, hint: `${connectionAddress(entry)} · ${connectionStatus(entry)}`,
      icon: entry.status === "connecting" ? <Loader size={17} /> : entry.kind === "container" ? <BoxIcon size={17} /> : <ServerIcon size={17} />,
      children: group(entry.id),
    })),
    { id: "environment:container", label: "Add container…", section: "Workspace actions", icon: <BoxIcon size={17} />, onSelect: () => onDialog("container") },
    { id: "environment:add", label: "Add SSH server…", section: "Workspace actions", icon: <ServerIcon size={17} />, onSelect: () => onDialog("ssh") },
  ];
  const label = SCOPE_LABELS[scope];
  return <Menu align="start" side="right" header={label} className="workspace-menu" width={340} searchable searchPlaceholder="Find a workspace" items={items}
    trigger={({ toggle, id, open }) => <button id={id} type="button" className="rail-section-add" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} onClick={toggle} disabled={choosing}><PlusIcon size={14} /></button>}
  />;
}

export function WorkspaceDialogs({ dialog, onClose }: { dialog: WorkspaceDialog | undefined; onClose: () => void }) {
  return <AnimatePresence>
    {dialog === "import" && <ImportSessions onClose={onClose} />}
    {dialog === "container" && <ContainerEnvironment onClose={onClose} />}
    {dialog === "ssh" && <NewSshConnection onClose={onClose} />}
  </AnimatePresence>;
}
