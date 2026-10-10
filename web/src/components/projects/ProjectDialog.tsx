import { useState } from "react";
import { resolveProjectSettings } from "../../../../shared/project-settings.ts";
import type { FolderSettings, Project } from "../../../../shared/protocol.ts";
import { api } from "../../lib/api.ts";
import { useApp } from "../../lib/store.ts";
import { ActionError } from "../ActionError.tsx";
import { FolderIcon } from "../icons/folders.tsx";
import { Loader } from "../Loader.tsx";
import { Modal } from "../Modal.tsx";
import { ProjectOptionRows } from "./ProjectOptionRows.tsx";

export function ProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const defaults = useApp((state) => state.projectDefaults);
  const [name, setName] = useState(project.name);
  const [overrides, setOverrides] = useState<FolderSettings>(project.settings ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api<Project>(`projects?projectId=${project.id}`, { method: "PATCH", body: JSON.stringify({ name, settings: overrides }) });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal className="project-dialog" title={project.name} description={project.path} icon={<FolderIcon size={18} />}
      busy={busy} onClose={onClose} onSubmit={() => void save()} initialFocus="#project-name"
      footer={<>
        <button className="btn" type="button" data-cancel disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={busy || !name.trim()}>{busy && <Loader size={14} />}Save</button>
      </>}>
      <label className="feature-field">Name<input id="project-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
      <p className="settings-note">These start out the same as your defaults. Change one to set it only for this project.</p>
      <div className="settings-group">
        <ProjectOptionRows settings={resolveProjectSettings(defaults, overrides)} overrides={overrides}
          update={patch => setOverrides(previous => ({ ...previous, ...patch }))} />
      </div>
      <ActionError className="dialog-error" message={error} onDismiss={() => setError("")} />
    </Modal>
  );
}
