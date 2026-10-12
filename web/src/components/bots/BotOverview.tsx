import type { Bot } from "../../../../shared/bots.ts";
import { threadActivity } from "../../lib/format.ts";
import { useApp } from "../../lib/store.ts";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { ExpandIcon } from "../icons/media.tsx";
import { expandBrowser } from "../../lib/browser-takeover.ts";
import { SettingsIcon } from "../SettingsIcon.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { botMood } from "../../lib/roster.ts";
import type { BotPage } from "./BotPanel.tsx";
import { BotScreenPage } from "./BotScreenPage.tsx";
import { RoutineSection } from "../routines/RoutineSection.tsx";

export function BotOverview({ bot, onPage }: { bot: Bot; onPage: (page: BotPage) => void }) {
  const thread = useApp((state) => state.threads[bot.threadId]);
  const mood = botMood(thread);
  const activity = thread ? threadActivity(thread) : undefined;
  const queued = thread?.queue?.length ?? 0;
  const waitingFor = useApp((state) =>
    state.questions.find((request) => request.threadId === bot.threadId)?.questions[0]?.question
    ?? (state.permissions.some((request) => request.threadId === bot.threadId) ? "Approve or deny the action below the chat." : undefined));
  const page = useApp((state) => Object.values(state.browsers).findLast((browser) => browser.threadId === bot.threadId));
  const browsing = Boolean(window.citropyDesktop && page && page.url !== "about:blank" && !page.dialog);
  return (
    <>
      <section className="bot-screen" aria-label={`${bot.name}'s screen`}>
        <div className="bot-section-head">
          <h3 className="bot-section-title">{bot.name}'s screen</h3>
          {browsing && (
            <button type="button" className="icon-btn" aria-label="Expand screen" title="Expand screen" onClick={() => expandBrowser(page!.id)}>
              <ExpandIcon size={14} />
            </button>
          )}
        </div>
        <div className="bot-screen-view" data-mood={mood}>
          {browsing ? <BotScreenPage page={page!} /> : <BotAvatar bot={bot} size={56} mood={mood} />}
          <strong>{!activity || activity.status === "stopped" ? "Ready" : activity.label}</strong>
          <p>{mood === "idle" ? "Waiting for a task." : mood === "awaiting" && waitingFor ? waitingFor : queued ? `${queued} more ${queued === 1 ? "message" : "messages"} waiting` : "Working…"}</p>
        </div>
      </section>
      <RoutineSection threadId={bot.threadId} emptyText="Routines are tasks this bot runs on a schedule." />
      <button type="button" className="bot-settings-link" onClick={() => onPage({ kind: "settings" })}>
        <SettingsIcon size={16} />
        <span>Settings</span>
        <ChevronRightIcon size={12} />
      </button>
    </>
  );
}
