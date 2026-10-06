import { useState } from "react";
import type { Project } from "../../../../shared/protocol.ts";
import { send } from "../../lib/socket.ts";
import { Modal } from "../Modal.tsx";

const MAX_NAME_LENGTH = 80;

export function RenameProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const trimmed = name.trim();
  const valid = Boolean(trimmed) && trimmed.length <= MAX_NAME_LENGTH;
  return (
    <Modal
      title="Rename project"
      description="This changes the name in Citropy. The folder on disk keeps its name."
      initialFocus="input"
      onClose={onClose}
      onSubmit={() => {
        if (!valid) return;
        send({ t: "project.rename", id: project.id, name: trimmed });
        onClose();
      }}
      footer={<>
        <button className="btn" type="button" data-cancel onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" type="submit" disabled={!valid}>Save</button>
      </>}
    >
      <label className="feature-field">
        Name
        <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
      </label>
    </Modal>
  );
}
