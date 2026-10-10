import { chooseWorkspace } from "../../lib/actions.ts";
import { shortPath } from "../../lib/format.ts";
import { useApp } from "../../lib/store.ts";
import { FolderIcon } from "../icons/folders.tsx";

export function ProjectStep() {
  const project = useApp((state) => state.projects.find(entry => entry.id === state.activeProjectId));
  const choosing = useApp((state) => state.choosingWorkspace);
  const home = useApp((state) => state.home);
  return (
    <div className="settings-group">
      <div className="setting-row">
        <span>
          <strong>{project ? project.name : "No project folder yet"}</strong>
          <small>{project ? shortPath(project.path, home) : "Choose the folder you want the AI to work in. You can add more later."}</small>
        </span>
        <button className="btn" type="button" data-variant={project ? undefined : "primary"} onClick={chooseWorkspace} disabled={choosing}>
          <FolderIcon size={14} />
          {choosing ? "Choose a folder in the system dialog…" : project ? "Choose another…" : "Choose folder…"}
        </button>
      </div>
    </div>
  );
}
