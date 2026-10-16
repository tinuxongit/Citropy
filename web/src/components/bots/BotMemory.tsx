import type { Bot } from "../../../../shared/bots.ts";
import { removeMemory } from "../../lib/bots.ts";
import { day } from "../../lib/format.ts";
import { TrashIcon } from "../icons/actions.tsx";

export function BotMemory({ bot }: { bot: Bot }) {
  return (
    <section className="bot-memory" aria-label="Memory">
      <h3 className="bot-section-title">Memory</h3>
      {bot.memory.length ? (
        <ul className="bot-memory-list">
          {bot.memory.map((entry) => (
            <li key={entry.id} className="bot-memory-row">
              <span className="bot-routine-text">
                <span className="bot-memory-text">{entry.text}</span>
                <small>{day(entry.savedAt)}</small>
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Forget this"
                title="Forget this"
                onClick={() => removeMemory(bot.id, entry.id)}
              >
                <TrashIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bot-memory-empty">
          Nothing saved yet. Ask {bot.name} to remember something and it shows up here.
        </p>
      )}
    </section>
  );
}
