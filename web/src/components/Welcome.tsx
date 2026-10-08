import { MessageSquarePlus } from "./icons.ts";
import { FolderIcon, FolderOpenIcon } from "./FolderIcon.tsx";
import { createThread, openProject, chooseWorkspace } from "../lib/actions.ts";
import { shortPath } from "../lib/format.ts";
import { useApp } from "../lib/store.ts";
import { hasUsableAccount } from "../../../shared/provider-account.ts";

const RECENT_PROJECTS = 5;

export function Welcome() {
  const projects = useApp((state) => state.projects);
  const providers = useApp((state) => state.providers);
  const home = useApp((state) => state.home);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const choosing = useApp((state) => state.choosingWorkspace);
  const creating = useApp((state) => state.creatingThread);
  const connected = useApp((state) => state.connected);

  const project = projects.find((entry) => entry.id === activeProjectId);
  const others = projects.filter((entry) => entry !== project).slice(0, RECENT_PROJECTS);
  const canStart = providers.some(hasUsableAccount);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        {project ? <FolderOpenIcon size={36} className="welcome-mark" /> : <FolderIcon size={36} className="welcome-mark" />}
        <h1 className="truncate">{project ? project.name : "Open a workspace"}</h1>
        <p className="welcome-path truncate">{project ? shortPath(project.path, home) : "Choose a project folder to start working."}</p>

        {project ? (
          <button className="btn" type="button" data-variant="primary" onClick={() => createThread()} disabled={!connected || creating || !canStart}>
            <MessageSquarePlus size={14} />New thread</button>
        ) : (
          <button className="btn" type="button" data-variant="primary" onClick={chooseWorkspace} disabled={choosing}>
            <FolderIcon size={16} />
            {choosing ? "Choose a folder in the system dialog…" : "Choose folder…"}
          </button>
        )}

        {project && !canStart && <p className="settings-note">Enable a provider in Settings to start a conversation.</p>}
        {others.length > 0 && (
          <div className="recent-list">
            <span className="recent-label">{project ? "Other projects" : "Recent projects"}</span>
            {others.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="recent-item"
                onClick={() => openProject(entry.path)}
              >
                <FolderIcon size={16} />
                <span className="truncate">{entry.name}</span>
                <span className="recent-path truncate">{shortPath(entry.path, home)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
