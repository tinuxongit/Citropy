import type { ReactNode } from "react";
import type { SkillInfo } from "../../../../shared/features.ts";

export function SkillCard({ skill, icon, source, busy, onToggle, onOpen }: {
  skill: SkillInfo;
  icon: ReactNode;
  source: string;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="skill-card">
      <button className="skill-card-open" type="button" aria-haspopup="dialog" onClick={onOpen}>
        {icon}
        <strong>{skill.name}</strong>
        <small>{source}</small>
        <span>{skill.description || "No description provided."}</span>
      </button>
      <input
        className="setting-switch"
        type="checkbox"
        role="switch"
        aria-label={`Enable ${skill.name}, ${source}`}
        checked={skill.enabled}
        disabled={busy}
        onChange={onToggle}
      />
    </article>
  );
}
