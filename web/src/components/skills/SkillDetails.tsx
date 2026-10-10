import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "../Modal.tsx";
import { Prose } from "../parts/Prose.tsx";
import { ActionError } from "../ActionError.tsx";
import { api } from "../../lib/api.ts";
import type { SkillInfo } from "../../../../shared/features.ts";

export function SkillDetails({ skill, icon, source, projectId, actions, onClose }: {
  skill: SkillInfo;
  icon: ReactNode;
  source: string;
  projectId?: string;
  actions: ReactNode;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<{ content: string }>(
      `skills?${new URLSearchParams({ id: skill.id, ...(projectId ? { projectId } : {}) })}`,
      { signal: controller.signal },
    )
      .then((result) => setContent(result.content))
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [skill.id, projectId]);
  return (
    <Modal
      className="skill-details"
      title={skill.name}
      description={source}
      icon={icon}
      onClose={onClose}
      footer={<>
        {actions}
        <button className="btn" data-cancel type="button" onClick={onClose}>Close</button>
      </>}
    >
      {skill.description && <p>{skill.description}</p>}
      <p className="feature-path">{skill.path}</p>
      <ActionError className="dialog-error" message={error} onDismiss={() => setError("")} />
      <Prose text={content || "Loading instructions…"} live={false} />
    </Modal>
  );
}
