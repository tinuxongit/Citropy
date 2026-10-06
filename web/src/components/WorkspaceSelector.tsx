import { ImportSessions } from "./ImportSessions.tsx";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Box, FolderOpen, FolderPlus, Import, Monitor, Plus, Server, Trash2 } from "lucide-react";
import { ContainerEnvironment } from "./ContainerEnvironment.tsx";
import { NewSshConnection } from "./EnvironmentSettings.tsx";
import { selectEnvironment, useEnvironments, useWorkspaceCatalog } from "../lib/environment.ts";
import { reportError } from "../lib/api.ts";
import { chooseWorkspaceOn, closeProject } from "../lib/actions.ts";
import { shortPath } from "../lib/format.ts";
import { confirmAction, selectProject, useApp } from "../lib/store.ts";
import type { Project } from "../../../shared/protocol.ts";
import { Menu, type MenuItem } from "./Menu.tsx";
import { PixelLoader } from "./PixelLoader.tsx";

export function WorkspaceSelector() {
  const environments = useEnvironments();
  const catalog = useWorkspaceCatalog();
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [container, setContainer] = useState(false);
  const projects = useApp(state => state.projects);
  const activeProjectId = useApp(state => state.activeProjectId);
  const home = useApp(state => state.home);
  const choosing = useApp(state => state.choosingWorkspace);
  const desktop = Boolean(window.citropyDesktop?.connectEnvironment);
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
        icon: <FolderOpen size={17} className="workspace-folder-icon" />,
        action: { label: `Remove project ${entry.name}`, icon: <Trash2 size={14} />, onSelect: () => { void remove(id, entry); } },
        onSelect: () => {
          if (current) { if (entry.id !== activeProjectId) selectProject(entry.id); }
          else void selectEnvironment(id, entry.id).catch(reportError);
        },
      })),
      ...(!current && !catalog[id] ? [{ id: `${id}:load`, label: "Load workspaces", icon: <Server size={17} />, onSelect: () => { void selectEnvironment(id).catch(reportError); } }] : []),
    ];
  };
  const items: MenuItem[] = desktop ? [
    { id: "environment:local", label: "Local", hint: "This computer", icon: <Monitor size={17} />, children: group("local") },
    ...environments.connections.map(entry => ({
      id: `environment:${entry.id}`, label: entry.name, hint: entry.target,
      icon: entry.status === "connecting" ? <PixelLoader size={17} /> : entry.kind === "container" ? <Box size={17} /> : <Server size={17} />,
      children: group(entry.id),
    })),
    { id: "environment:container", label: "Add container…", section: "Workspace actions", icon: <Box size={17} />, onSelect: () => setContainer(true) },
    { id: "environment:add", label: "Connect over SSH…", section: "Workspace actions", icon: <Server size={17} />, onSelect: () => setAdding(true) },
  ] : group("local");
  items.push({ id: "import-sessions", label: "Import conversations…", section: "Workspace actions", icon: <Import size={17} />, onSelect: () => setImporting(true) });
  return <>
    <Menu align="start" side="right" header="Add project" className="workspace-menu" width={340} searchable searchPlaceholder="Find a workspace" items={items}
      trigger={({ toggle, id, open }) => <button id={id} type="button" className="new-thread project-add"
        aria-haspopup="menu" aria-expanded={open}
        onClick={toggle} disabled={choosing}><Plus size={16} />Add project</button>}
    />
    <AnimatePresence>{importing && <ImportSessions onClose={() => setImporting(false)} />}{container && <ContainerEnvironment onClose={() => setContainer(false)} />}{adding && <NewSshConnection onClose={() => setAdding(false)} />}</AnimatePresence>
  </>;
}
