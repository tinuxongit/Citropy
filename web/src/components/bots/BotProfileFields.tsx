import { useId, type ReactNode } from "react";
import { BOT_LIMITS, type Bot } from "../../../../shared/bots.ts";

export type TextField = "name" | "title" | "description";
export type ProfileDraft = Pick<Bot, TextField>;

const DESCRIPTION_ROWS = 7;
const BRIEF_ROWS = 4;

const FIELDS: Array<{ key: TextField; label: string; max: number; placeholder: string; optional?: boolean }> = [
  { key: "name", label: "Name", max: BOT_LIMITS.nameLength, placeholder: "Research Bot" },
  { key: "title", label: "Title", max: BOT_LIMITS.titleLength, placeholder: "Competitive research", optional: true },
  { key: "description", label: "Description", max: BOT_LIMITS.descriptionLength, placeholder: "What this bot does, how it works, and what it should never do.", optional: true },
];

// descriptionBar sits inside the description box under the text, the way the composer carries its model.
export function BotProfileFields({ draft, onChange, onCommit, only, descriptionBar }: { draft: ProfileDraft; onChange: (draft: ProfileDraft) => void; onCommit?: (key: TextField) => void; only?: TextField[]; descriptionBar?: ReactNode }) {
  const briefLabel = useId();
  return FIELDS.filter(({ key }) => !only || only.includes(key)).map(({ key, label, max, placeholder, optional }) => {
    const heading = <>{label}{optional && <small className="feature-optional">optional</small>}</>;
    if (key === "description" && descriptionBar) return (
      <div key={key} className="feature-field">
        <span id={briefLabel}>{heading}</span>
        <div className="bot-brief">
          <textarea rows={BRIEF_ROWS} maxLength={max} placeholder={placeholder} value={draft[key]} aria-labelledby={briefLabel}
            onChange={(event) => onChange({ ...draft, [key]: event.target.value })} onBlur={() => onCommit?.(key)} />
          {descriptionBar}
        </div>
      </div>
    );
    return (
      <label key={key} className="feature-field">
        <span>{heading}</span>
        {key === "description" ? (
          <textarea rows={DESCRIPTION_ROWS} maxLength={max} placeholder={placeholder} value={draft[key]}
            onChange={(event) => onChange({ ...draft, [key]: event.target.value })} onBlur={() => onCommit?.(key)} />
        ) : (
          <input maxLength={max} placeholder={placeholder} value={draft[key]} data-field={key}
            onChange={(event) => onChange({ ...draft, [key]: event.target.value })} onBlur={() => onCommit?.(key)}
            onKeyDown={(event) => { if (onCommit && event.key === "Enter") event.currentTarget.blur(); }} />
        )}
      </label>
    );
  });
}
