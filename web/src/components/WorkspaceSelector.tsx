import { ImportSessions } from "./ImportSessions.tsx";
import { AnimatePresence } from "motion/react";
import { Box, FolderPlus, Import, Plus, Trash2 } from "lucide-react";
import { ServerIcon } from "./ServerIcon.tsx";
import { FolderOpenIcon } from "./FolderIcon.tsx";
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
      { id: `${id}:open`, label: "Open another folder…", icon: <FolderPlus size={17} className="workspace-add-icon" />, disabled: choosing, onSelect: () => { void chooseWorkspaceOn(id); } },
      ...entries.map(entry => ({
        id: `${id}:${entry.id}`, label: entry.name, hint: shortPath(entry.path, root),
        selected: current && entry.id === activeProjectId,
        icon: <FolderOpenIcon size={17} className="workspace-folder-icon" />,
        action: { label: `Remove project ${entry.name}`, icon: <Trash2 size={14} />, onSelect: () => { void remove(id, entry); } },
        onSelect: () => {
          if (current) { if (entry.id !== activeProjectId) selectProject(entry.id); }
          else void selectEnvironment(id, entry.id).catch(reportError);
        },
      })),
      ...(!current && !catalog[id] ? [{ id: `${id}:load`, label: "Load workspaces", icon: <ServerIcon size={17} />, onSelect: () => { void selectEnvironment(id).catch(reportError); } }] : []),
    ];
  };
  const items: MenuItem[] = scope === "local" ? [
    ...group("local"),
    { id: "import-sessions", label: "Import conversations…", section: "Workspace actions", icon: <Import size={17} />, onSelect: () => onDialog("import") },
  ] : [
    ...environments.connections.map(entry => ({
      id: `environment:${entry.id}`, label: entry.name, hint: entry.target,
      icon: entry.status === "connecting" ? <Loader size={17} /> : entry.kind === "container" ? <Box size={17} /> : <ServerIcon size={17} />,
      children: group(entry.id),
    })),
    { id: "environment:container", label: "Add container…", section: "Workspace actions", icon: <Box size={17} />, onSelect: () => onDialog("container") },
    { id: "environment:add", label: "Connect over SSH…", section: "Workspace actions", icon: <ServerIcon size={17} />, onSelect: () => onDialog("ssh") },
  ];
  const label = SCOPE_LABELS[scope];
  return <Menu align="start" side="right" header={label} className="workspace-menu" width={340} searchable searchPlaceholder="Find a workspace" items={items}
    trigger={({ toggle, id, open }) => <button id={id} type="button" className="rail-section-add" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} onClick={toggle} disabled={choosing}><Plus size={14} /></button>}
  />;
}

export function WorkspaceDialogs({ dialog, onClose }: { dialog: WorkspaceDialog | undefined; onClose: () => void }) {
  return <AnimatePresence>
    {dialog === "import" && <ImportSessions onClose={onClose} />}
    {dialog === "container" && <ContainerEnvironment onClose={onClose} />}
    {dialog === "ssh" && <NewSshConnection onClose={onClose} />}
  </AnimatePresence>;
}
