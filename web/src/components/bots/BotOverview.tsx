import { describeSchedule, type Bot } from "../../../../shared/bots.ts";
import { threadActivity, until } from "../../lib/format.ts";
import { useApp } from "../../lib/store.ts";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { SettingsIcon } from "../SettingsIcon.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { botMood } from "./bot-order.ts";
import type { BotPage } from "./BotPanel.tsx";

export function BotOverview({ bot, onPage }: { bot: Bot; onPage: (page: BotPage) => void }) {
  const thread = useApp((state) => state.threads[bot.threadId]);
  const mood = botMood(thread);
  const activity = thread ? threadActivity(thread) : undefined;
  const queued = thread?.queue?.length ?? 0;
  return (
    <>
      <section className="bot-screen" aria-label={`${bot.name}'s screen`}>
        <h3 className="bot-section-title">{bot.name}'s screen</h3>
        <div className="bot-screen-view" data-mood={mood}>
          <BotAvatar bot={bot} size={56} mood={mood} />
          <strong>{activity?.label ?? "Ready"}</strong>
          <p>{mood === "idle" ? bot.preview || "Waiting for a task." : queued ? `${queued} more ${queued === 1 ? "message" : "messages"} waiting` : "Working on your request."}</p>
        </div>
      </section>
      <section className="bot-routines" aria-label="Routines">
        <div className="bot-section-head">
          <h3 className="bot-section-title">Routines</h3>
          {bot.routines.length > 0 && (
            <button type="button" className="icon-btn" aria-label="Create routine" title="Create routine" onClick={() => onPage({ kind: "routine" })}>
              <PlusIcon size={14} />
            </button>
          )}
        </div>
        {bot.routines.length ? (
          <div className="bot-routine-list">
            {bot.routines.map((routine) => (
              <button type="button" key={routine.id} className="bot-routine-row" data-paused={routine.paused || undefined} onClick={() => onPage({ kind: "routine", id: routine.id })}>
                <span className="bot-routine-text">
                  <strong className="truncate">{routine.name}</strong>
                  <small className="truncate">
                    {describeSchedule(routine.schedule)}
                    {routine.paused ? " · Paused" : routine.nextRunAt ? ` · Next in ${until(routine.nextRunAt)}` : ""}
                  </small>
                </span>
                {routine.runs[0] && <span className="bot-run-dot" data-status={routine.runs[0].status} aria-label={`Last run ${routine.runs[0].status}`} />}
                <ChevronRightIcon size={12} />
              </button>
            ))}
          </div>
        ) : (
          <div className="bot-routines-empty">
            <p>Routines are recurring tasks this agent runs on a schedule.</p>
            <button type="button" className="btn" onClick={() => onPage({ kind: "routine" })}>Create Routine</button>
          </div>
        )}
      </section>
      <button type="button" className="bot-settings-link" onClick={() => onPage({ kind: "settings" })}>
        <SettingsIcon size={16} />
        <span>Settings</span>
        <ChevronRightIcon size={12} />
      </button>
    </>
  );
}
