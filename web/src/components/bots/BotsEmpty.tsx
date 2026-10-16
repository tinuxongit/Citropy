import { BOT_TEMPLATES } from "../../../../shared/bot-templates.ts";
import { NEW_BOT_LOOK } from "../../../../shared/bots.ts";
import { hasUsableAccount } from "../../../../shared/provider-account.ts";
import { describeSchedule } from "../../../../shared/routines.ts";
import { openBotTemplate, openNewBotChat } from "../../lib/bots.ts";
import { useApp } from "../../lib/store.ts";
import { BotAvatar } from "./BotAvatar.tsx";

const SAMPLE = { color: "purple", shape: "cloud", ...NEW_BOT_LOOK } as const;
const TEMPLATE_AVATAR_SIZE = 32;

export function BotsEmpty() {
  const hasBots = useApp((state) => Object.keys(state.bots).length > 0);
  const canCreate = useApp(
    (state) =>
      state.connected && Boolean(state.activeProjectId) && state.providers.some(hasUsableAccount),
  );
  return (
    <div className="bots-empty">
      <BotAvatar bot={SAMPLE} size={72} />
      <h2>{hasBots ? "Pick a bot" : "Make your first bot"}</h2>
      <p>
        Bots are agents with their own name, memory and routines. Give one a job and it keeps
        working on a schedule.
      </p>
      {!hasBots && (
        <button
          type="button"
          className="btn"
          data-variant="primary"
          disabled={!canCreate}
          onClick={openNewBotChat}
        >
          Create a bot
        </button>
      )}
      {!hasBots && (
        <section className="bot-template-cards" aria-label="Templates">
          <h3>Or start from a template</h3>
          {BOT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="bot-template-card"
              disabled={!canCreate}
              onClick={() => openBotTemplate(template.id)}
            >
              <BotAvatar bot={template.look} size={TEMPLATE_AVATAR_SIZE} />
              <span className="bot-template-card-text">
                <strong>{template.name}</strong>
                <span>{template.title}</span>
                <small>{describeSchedule(template.routine.schedule)}</small>
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
