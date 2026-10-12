import { useState } from "react";
import { BOT_COLORS, BOT_LIMITS, BOT_SHAPES, type Bot, type BotProfile } from "../../../../shared/bots.ts";
import { reportError } from "../../lib/api.ts";
import { updateBot } from "../../lib/bots.ts";
import { BotAvatar } from "./BotAvatar.tsx";

type TextField = "name" | "title" | "description";

const FIELDS: Array<{ key: TextField; label: string; max: number; placeholder: string }> = [
  { key: "name", label: "Name", max: BOT_LIMITS.nameLength, placeholder: "Research Bot" },
  { key: "title", label: "Title", max: BOT_LIMITS.titleLength, placeholder: "Competitive research" },
  { key: "description", label: "Description", max: BOT_LIMITS.descriptionLength, placeholder: "What this bot does, how it works, and what it should never do." },
];

export function BotSettings({ bot }: { bot: Bot }) {
  const [draft, setDraft] = useState<Record<TextField, string>>({ name: bot.name, title: bot.title, description: bot.description });
  const save = (profile: Partial<BotProfile>) => void updateBot(bot.id, profile).catch((error) => {
    setDraft({ name: bot.name, title: bot.title, description: bot.description });
    reportError(error);
  });
  const commit = (key: TextField) => {
    if (draft[key].trim() !== bot[key]) save({ [key]: draft[key] });
  };
  return (
    <div className="bot-settings">
      <div className="bot-settings-avatar">
        <BotAvatar bot={bot} size={88} />
        <div className="bot-swatches" role="radiogroup" aria-label="Color">
          {BOT_COLORS.map((color) => (
            <button key={color} type="button" role="radio" className="bot-swatch" data-color={color} aria-checked={bot.color === color} aria-label={color} title={color} onClick={() => save({ color })} />
          ))}
        </div>
        <div className="bot-shapes" role="radiogroup" aria-label="Shape">
          {BOT_SHAPES.map((shape) => (
            <button key={shape} type="button" role="radio" className="bot-shape" aria-checked={bot.shape === shape} aria-label={shape} title={shape} onClick={() => save({ shape })}>
              <BotAvatar bot={{ color: bot.color, shape }} size={28} />
            </button>
          ))}
        </div>
      </div>
      {FIELDS.map(({ key, label, max, placeholder }) => (
        <label key={key} className="feature-field">
          <span>{label}</span>
          {key === "description" ? (
            <textarea rows={7} maxLength={max} placeholder={placeholder} value={draft[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} onBlur={() => commit(key)} />
          ) : (
            <input maxLength={max} placeholder={placeholder} value={draft[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} onBlur={() => commit(key)}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          )}
        </label>
      ))}
      <label className="bot-notify">
        <span>
          <strong>Notifications</strong>
          <small>Get notified when this agent finishes or needs input</small>
        </span>
        <input className="setting-switch" type="checkbox" role="switch" checked={bot.notifications} onChange={(event) => save({ notifications: event.target.checked })} />
      </label>
    </div>
  );
}
