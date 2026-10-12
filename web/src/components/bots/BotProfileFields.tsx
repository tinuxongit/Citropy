import { BOT_LIMITS, type Bot } from "../../../../shared/bots.ts";

export type TextField = "name" | "title" | "description";
export type ProfileDraft = Pick<Bot, TextField>;

const DESCRIPTION_ROWS = 7;

const FIELDS: Array<{ key: TextField; label: string; max: number; placeholder: string }> = [
  { key: "name", label: "Name", max: BOT_LIMITS.nameLength, placeholder: "Research Bot" },
  { key: "title", label: "Title", max: BOT_LIMITS.titleLength, placeholder: "Competitive research" },
  { key: "description", label: "Description", max: BOT_LIMITS.descriptionLength, placeholder: "What this bot does, how it works, and what it should never do." },
];

export function BotProfileFields({ draft, onChange, onCommit }: { draft: ProfileDraft; onChange: (draft: ProfileDraft) => void; onCommit?: (key: TextField) => void }) {
  return FIELDS.map(({ key, label, max, placeholder }) => (
    <label key={key} className="feature-field">
      <span>{label}</span>
      {key === "description" ? (
        <textarea rows={DESCRIPTION_ROWS} maxLength={max} placeholder={placeholder} value={draft[key]}
          onChange={(event) => onChange({ ...draft, [key]: event.target.value })} onBlur={() => onCommit?.(key)} />
      ) : (
        <input maxLength={max} placeholder={placeholder} value={draft[key]} data-field={key}
          onChange={(event) => onChange({ ...draft, [key]: event.target.value })} onBlur={() => onCommit?.(key)}
          onKeyDown={(event) => { if (onCommit && event.key === "Enter") event.currentTarget.blur(); }} />
      )}
    </label>
  ));
}
