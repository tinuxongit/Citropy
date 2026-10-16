import { useState } from "react";
import { ImportSessions } from "./ImportSessions.tsx";
import { AnimatePresence } from "motion/react";
import { BoxIcon } from "./icons/hardware.tsx";
import { FolderPlusIcon } from "./icons/folders.tsx";
import { HistoryIcon } from "./icons/rotation.tsx";
import { PlusIcon } from "./icons/marks.tsx";
import { GitHubIcon } from "./icons/BrandIcon.tsx";
import { ServerIcon } from "./icons/ServerIcon.tsx";
import { CloneFromGitHub } from "./github/CloneFromGitHub.tsx";
import { ContainerEnvironment } from "./ContainerEnvironment.tsx";
import { NewSshConnection } from "./EnvironmentSettings.tsx";
import { connectionName, selectEnvironment, useEnvironments } from "../lib/environment.ts";
import { reportError } from "../lib/api.ts";
import { chooseWorkspaceOn } from "../lib/actions.ts";
import { useApp } from "../lib/store.ts";
import { Menu, type MenuItem } from "./Menu.tsx";
import { Loader } from "./Loader.tsx";
import { connectionAddress, connectionStatus } from "./environments/environment-status.ts";

export type WorkspaceScope = "local" | "servers";
export type WorkspaceDialog = "import" | "clone" | "container" | "ssh";

export const canConnectServers = () => Boolean(window.citropyDesktop?.connectEnvironment);

const SCOPE_LABELS: Record<WorkspaceScope, string> = { local: "Add local project", servers: "Add server project" };

// Local goes straight to where the project comes from. Servers first ask which server, unless there is only one.
export function WorkspaceMenu({ scope, onDialog }: { scope: WorkspaceScope; onDialog: (dialog: WorkspaceDialog) => void }) {
  const environments = useEnvironments();
  const choosing = useApp(state => state.choosingWorkspace);
  const [chosen, setChosen] = useState<string>();
  const connections = environments.connections;
  const machine = scope === "local" ? "local" : chosen ?? (connections.length === 1 ? connections[0]!.id : undefined);
  const openOn = (id: string, dialog: WorkspaceDialog) => {
    void (id === environments.activeId ? Promise.resolve() : selectEnvironment(id)).then(() => onDialog(dialog), reportError);
  };
  const servers: MenuItem[] = connections.map(entry => ({
    id: `machine:${entry.id}`, label: entry.name, hint: `${connectionAddress(entry)} · ${connectionStatus(entry)}`,
    icon: entry.status === "connecting" ? <Loader size={17} /> : entry.kind === "container" ? <BoxIcon size={17} /> : <ServerIcon size={17} />,
    keepOpen: true, onSelect: () => setChosen(entry.id),
  }));
  const sources = (id: string): MenuItem[] => [
    { id: "source:folder", label: "Existing folder", hint: "Browse a folder on disk", icon: <FolderPlusIcon size={17} />, disabled: choosing, onSelect: () => { void chooseWorkspaceOn(id); } },
    { id: "source:github", label: "GitHub repository", hint: "Clone from your account or all of GitHub", icon: <GitHubIcon size={17} />, onSelect: () => openOn(id, "clone") },
    { id: "source:import", label: "Past conversations", hint: "From Claude Code, Codex, or OpenCode", icon: <HistoryIcon size={17} />, onSelect: () => openOn(id, "import") },
  ];
  const actions: MenuItem[] = scope === "servers" && chosen === undefined ? [
    { id: "environment:container", label: "Add container…", section: "Workspace actions", icon: <BoxIcon size={17} />, onSelect: () => onDialog("container") },
    { id: "environment:add", label: "Add SSH server…", section: "Workspace actions", icon: <ServerIcon size={17} />, onSelect: () => onDialog("ssh") },
  ] : [];
  const label = SCOPE_LABELS[scope];
  const header = scope === "servers" && machine !== undefined ? `Add project on ${connectionName(machine)}` : label;
  return <Menu align="start" side="right" header={header} className="workspace-menu" width={320}
    items={[...machine === undefined ? servers : sources(machine), ...actions]}
    trigger={({ toggle, id, open }) => <button id={id} type="button" className="rail-section-add" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) setChosen(undefined); toggle(); }} disabled={choosing}><PlusIcon size={14} /></button>}
  />;
}

export function WorkspaceDialogs({ dialog, onClose }: { dialog: WorkspaceDialog | undefined; onClose: () => void }) {
  return <AnimatePresence>
    {dialog === "import" && <ImportSessions onClose={onClose} />}
    {dialog === "clone" && <CloneFromGitHub onClose={onClose} />}
    {dialog === "container" && <ContainerEnvironment onClose={onClose} />}
    {dialog === "ssh" && <NewSshConnection onClose={onClose} />}
  </AnimatePresence>;
}
