import { useEffect, useId, useState } from "react";
import { api } from "../../lib/api.ts";
import { CITROPY_SKILL_LIMITS, type CitropySkillDraft, type SkillInfo } from "../../../../shared/features.ts";

const EMPTY_DRAFT: CitropySkillDraft = { name: "", description: "", instructions: "" };
const INSTRUCTION_ROWS = 14;

export function CitropySkillForm({ skill, busy, onSave, onCancel, onError }: {
  skill: SkillInfo | undefined;
  busy: boolean;
  onSave: (draft: CitropySkillDraft) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const nameHint = useId();
  const [draft, setDraft] = useState<CitropySkillDraft>();
  useEffect(() => {
    if (!skill) {
      setDraft(EMPTY_DRAFT);
      return;
    }
    const controller = new AbortController();
    api<CitropySkillDraft>(`skills/citropy?id=${skill.id}`, { signal: controller.signal })
      .then(setDraft)
      .catch((error) => {
        if (!controller.signal.aborted) onError(error.message);
      });
    return () => controller.abort();
  }, [skill?.id]);
  const update = (patch: Partial<CitropySkillDraft>) => setDraft((current) => ({ ...current!, ...patch }));
  const disabled = busy || !draft;
  return (
    <form
      className="settings-group citropy-skill-form"
      aria-label={skill ? `Edit ${skill.name}` : "New skill"}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft!);
      }}
    >
      <h2 className="settings-group-heading">{skill ? `Edit ${skill.name}` : "New skill"}</h2>
      <label className="feature-field">
        Name
        <input
          value={draft?.name ?? ""}
          disabled={disabled}
          maxLength={CITROPY_SKILL_LIMITS.name}
          placeholder="release-notes"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={nameHint}
          onChange={(event) => update({ name: event.target.value.toLowerCase().replace(/\s+/g, "-") })}
        />
        <small id={nameHint}>Lowercase words joined by hyphens. Type @ and this name in a conversation to use it.</small>
      </label>
      <label className="feature-field">
        When to use it
        <input
          value={draft?.description ?? ""}
          disabled={disabled}
          maxLength={CITROPY_SKILL_LIMITS.description}
          placeholder="Use when writing release notes for a new version"
          onChange={(event) => update({ description: event.target.value })}
        />
        <small>Agents read this line to decide when the skill applies.</small>
      </label>
      <label className="feature-field">
        Instructions
        <textarea
          rows={INSTRUCTION_ROWS}
          value={draft?.instructions ?? ""}
          disabled={disabled}
          placeholder="Steps, rules, and examples for the agent to follow. Markdown works."
          onChange={(event) => update({ instructions: event.target.value })}
        />
      </label>
      <div className="feature-save">
        <button className="btn" data-variant="ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={disabled || !draft.name || !draft.description.trim() || !draft.instructions.trim()}>
          {skill ? "Save" : "Add skill"}
        </button>
      </div>
    </form>
  );
}
