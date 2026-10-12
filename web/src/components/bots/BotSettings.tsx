import { useState } from "react";
import type { Bot, BotProfile } from "../../../../shared/bots.ts";
import { reportError } from "../../lib/api.ts";
import { updateBot } from "../../lib/bots.ts";
import { BotLookPicker } from "./BotLookPicker.tsx";
import { BotMemory } from "./BotMemory.tsx";
import { BotProfileFields, type ProfileDraft, type TextField } from "./BotProfileFields.tsx";

export function BotSettings({ bot }: { bot: Bot }) {
  const [draft, setDraft] = useState<ProfileDraft>({ name: bot.name, title: bot.title, description: bot.description });
  const save = (profile: Partial<BotProfile>) => void updateBot(bot.id, profile).catch((error) => {
    setDraft({ name: bot.name, title: bot.title, description: bot.description });
    reportError(error);
  });
  const commit = (key: TextField) => {
    const value = draft[key].trim();
    setDraft({ ...draft, [key]: value });
    if (value !== bot[key]) save({ [key]: value });
  };
  return (
    <div className="bot-settings">
      <BotLookPicker look={bot} onChange={save} />
      <BotProfileFields draft={draft} onChange={setDraft} onCommit={commit} />
      <label className="bot-notify">
        <span>
          <strong>Notifications</strong>
          <small>Get notified when this agent finishes or needs input</small>
        </span>
        <input className="setting-switch" type="checkbox" role="switch" checked={bot.notifications} onChange={(event) => save({ notifications: event.target.checked })} />
      </label>
      <BotMemory bot={bot} />
    </div>
  );
}
