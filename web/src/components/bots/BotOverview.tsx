import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Bot } from "../../../../shared/bots.ts";
import type { BrowserAction } from "../../../../shared/workbench.ts";
import { threadActivity } from "../../lib/format.ts";
import { send } from "../../lib/socket.ts";
import { useApp } from "../../lib/store.ts";
import { ArrowLeftIcon, ArrowRightIcon } from "../icons/arrows.tsx";
import { RotateCwIcon } from "../icons/rotation.tsx";
import { SiteIcon } from "../icons/SiteIcon.tsx";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { ExpandIcon } from "../icons/media.tsx";
import { expandBrowser } from "../../lib/browser-takeover.ts";
import { SettingsIcon } from "../icons/SettingsIcon.tsx";
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
  const waitingFor = useApp(
    (state) =>
      state.questions.find((request) => request.threadId === bot.threadId)?.questions[0]
        ?.question ??
      (state.permissions.some((request) => request.threadId === bot.threadId)
        ? "Approve or deny the action below the chat."
        : undefined),
  );
  const connected = useApp((state) => state.connected);
  const pages = useApp(
    useShallow((state) =>
      Object.values(state.browsers).filter(
        (browser) => browser.threadId === bot.threadId && browser.url !== "about:blank",
      ),
    ),
  );
  // Until you pick a tab, the screen follows the page the bot opened last.
  const [selectedId, setSelectedId] = useState<string>();
  const page = pages.find((browser) => browser.id === selectedId) ?? pages.at(-1);
  const browsing = Boolean(window.citropyDesktop && page && !page.dialog);
  const act = (input: BrowserAction) => {
    if (connected && page) send({ t: "browser.action", id: page.id, input });
  };
  return (
    <>
      <section className="bot-screen" aria-label={`${bot.name}'s screen`}>
        <div className="bot-section-head">
          <h3 className="bot-section-title">{bot.name}'s screen</h3>
          {browsing && (
            <div className="bot-screen-controls">
              <button
                type="button"
                className="icon-btn"
                disabled={!connected || !(page!.canGoBack || page!.mobile)}
                aria-label="Back"
                title="Back"
                onClick={() => act({ action: "back" })}
              >
                <ArrowLeftIcon size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={!connected || !page!.canGoForward}
                aria-label="Forward"
                title="Forward"
                onClick={() => act({ action: "forward" })}
              >
                <ArrowRightIcon size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={!connected}
                aria-label="Reload"
                title="Reload"
                onClick={() => act({ action: "reload" })}
              >
                <RotateCwIcon size={13} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Expand screen"
                title="Expand screen"
                onClick={() => expandBrowser(page!.id)}
              >
                <ExpandIcon size={14} />
              </button>
            </div>
          )}
        </div>
        {browsing && pages.length > 1 && (
          <div className="bot-screen-tabs" role="tablist" aria-label={`${bot.name}'s tabs`}>
            {pages.map((browser) => (
              <button
                key={browser.id}
                type="button"
                role="tab"
                aria-selected={browser.id === page!.id}
                title={browser.title}
                onClick={() => setSelectedId(browser.id)}
              >
                <SiteIcon url={browser.url} />
                <span className="truncate">{browser.title}</span>
              </button>
            ))}
          </div>
        )}
        <div className="bot-screen-view" data-mood={mood}>
          {browsing ? (
            <BotScreenPage page={page!} />
          ) : (
            <BotAvatar bot={bot} size={56} mood={mood} />
          )}
          <strong>{!activity || activity.status === "stopped" ? "Ready" : activity.label}</strong>
          <p>
            {mood === "idle"
              ? "Waiting for a task."
              : mood === "awaiting" && waitingFor
                ? waitingFor
                : queued
                  ? `${queued} more ${queued === 1 ? "message" : "messages"} waiting`
                  : "Working…"}
          </p>
        </div>
      </section>
      <RoutineSection
        threadId={bot.threadId}
        emptyText="Routines are tasks this bot runs on a schedule."
      />
      <button
        type="button"
        className="bot-settings-link"
        onClick={() => onPage({ kind: "settings" })}
      >
        <SettingsIcon size={16} />
        <span>Settings</span>
        <ChevronRightIcon size={12} />
      </button>
    </>
  );
}
