import { BOT_TEMPLATES, type BotTemplate } from "../../../../shared/bot-templates.ts";
import { describeSchedule } from "../../../../shared/routines.ts";
import { PlusIcon } from "../icons/marks.tsx";
import { BotAvatar } from "./BotAvatar.tsx";

const AVATAR_SIZE = 32;

export function BotTemplatePicker({ picked, onPick }: { picked?: BotTemplate; onPick: (template?: BotTemplate) => void }) {
  return (
    <div className="bot-templates">
      <div className="bot-template-list" role="radiogroup" aria-label="Start from">
        <button type="button" role="radio" className="bot-template" aria-checked={!picked} onClick={() => onPick()}>
          <span className="new-chat-plus"><PlusIcon size={16} /></span>
          <span>Blank</span>
        </button>
        {BOT_TEMPLATES.map((template) => (
          <button key={template.id} type="button" role="radio" className="bot-template" aria-checked={picked?.id === template.id} title={template.title} onClick={() => onPick(template)}>
            <BotAvatar bot={template.look} size={AVATAR_SIZE} />
            <span>{template.name}</span>
          </button>
        ))}
      </div>
      {picked && (
        <p className="bot-template-routine">
          Comes with the routine <strong>{picked.routine.name}</strong>. {describeSchedule(picked.routine.schedule)}.
        </p>
      )}
    </div>
  );
}
