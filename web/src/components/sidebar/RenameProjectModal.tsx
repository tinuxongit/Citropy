import { useState } from "react";
import type { Project } from "../../../../shared/protocol.ts";
import { useI18n } from "../../lib/i18n.ts";
import { send } from "../../lib/socket.ts";
import { Modal } from "../Modal.tsx";

const MAX_NAME_LENGTH = 80;

export function RenameProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const t = useI18n();
  const [name, setName] = useState(project.name);
  const trimmed = name.trim();
  const valid = Boolean(trimmed) && trimmed.length <= MAX_NAME_LENGTH;
  return (
    <Modal
      title={t("Rename project")}
      description={t("This changes the name in Citropy. The folder on disk keeps its name.")}
      initialFocus="input"
      onClose={onClose}
      onSubmit={() => {
        if (!valid) return;
        send({ t: "project.rename", id: project.id, name: trimmed });
        onClose();
      }}
      footer={<>
        <button className="btn" type="button" data-cancel onClick={onClose}>{t("Cancel")}</button>
        <button className="btn" data-variant="primary" type="submit" disabled={!valid}>{t("Save")}</button>
      </>}
    >
      <label className="feature-field">
        {t("Name")}
        <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
      </label>
    </Modal>
  );
}
