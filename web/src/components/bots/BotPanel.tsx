import { useState } from "react";
import { toggleBotPanel, useApp } from "../../lib/store.ts";
import { ChevronLeftIcon } from "../icons/chevrons.tsx";
import { CloseIcon } from "../icons/marks.tsx";
import { BotOverview } from "./BotOverview.tsx";
import { BotSettings } from "./BotSettings.tsx";
import { RoutineEditor } from "./RoutineEditor.tsx";

export type BotPage = { kind: "overview" } | { kind: "settings" } | { kind: "routine"; id?: string };

const OVERVIEW: BotPage = { kind: "overview" };

export function BotPanel() {
  const bot = useApp((state) => state.bots[state.activeBotId ?? ""]);
  const [page, setPage] = useState<BotPage>(OVERVIEW);
  const [pageBot, setPageBot] = useState(bot?.id);
  if (pageBot !== bot?.id) {
    setPageBot(bot?.id);
    setPage(OVERVIEW);
  }
  if (!bot) return <aside className="inspector bot-panel" aria-label="Bot" />;
  const routine = page.kind === "routine" && page.id ? bot.routines.find((entry) => entry.id === page.id) : undefined;
  const title = page.kind === "settings" ? "Settings" : page.kind === "routine" ? routine?.name ?? "New routine" : bot.name;
  return (
    <aside className="inspector bot-panel" aria-label={`${bot.name} details`}>
      <header className="bot-panel-head">
        {page.kind !== "overview" && (
          <button type="button" className="icon-btn" aria-label="Back" title="Back" onClick={() => setPage(OVERVIEW)}>
            <ChevronLeftIcon size={15} />
          </button>
        )}
        <h2 className="bot-panel-title truncate">{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close panel" title="Close panel" onClick={toggleBotPanel}>
          <CloseIcon size={14} />
        </button>
      </header>
      <div className="bot-panel-body scroll">
        {page.kind === "overview" && <BotOverview bot={bot} onPage={setPage} />}
        {page.kind === "settings" && <BotSettings key={bot.id} bot={bot} />}
        {page.kind === "routine" && <RoutineEditor key={page.id ?? "new"} bot={bot} routine={routine} onDone={() => setPage(OVERVIEW)} onSaved={(id) => setPage({ kind: "routine", id })} />}
      </div>
    </aside>
  );
}
