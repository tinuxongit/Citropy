import { useState } from "react";
import { MOD } from "../../lib/modifier-key.ts";
import { toggleBotPanel, useApp } from "../../lib/store.ts";
import { ChevronLeftIcon } from "../icons/chevrons.tsx";
import { CloseIcon } from "../icons/marks.tsx";
import { BotOverview } from "./BotOverview.tsx";
import { BotSettings } from "./BotSettings.tsx";
import { GroupPanel } from "./GroupPanel.tsx";
import { ResizeHandle } from "../ResizeHandle.tsx";

export type BotPage = { kind: "overview" } | { kind: "settings" };

const OVERVIEW: BotPage = { kind: "overview" };

export function BotPanel() {
  const bot = useApp((state) => state.bots[state.activeRosterId ?? ""]);
  const group = useApp((state) => state.botGroups[state.activeRosterId ?? ""]);
  const item = bot ?? group;
  const [page, setPage] = useState<BotPage>(OVERVIEW);
  const [pageItem, setPageItem] = useState(item?.id);
  if (pageItem !== item?.id) {
    setPageItem(item?.id);
    setPage(OVERVIEW);
  }
  if (!item) return <aside className="inspector bot-panel" aria-label="Bot" />;
  const title = page.kind === "settings" ? "Settings" : item.name;
  return (
    <aside className="inspector bot-panel" aria-label={`${item.name} details`}>
      <header className="bot-panel-head">
        {page.kind !== "overview" && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            title="Back"
            onClick={() => setPage(OVERVIEW)}
          >
            <ChevronLeftIcon size={15} />
          </button>
        )}
        <h2 className="bot-panel-title truncate">{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close panel"
          title={`Close panel (${MOD}Shift+,)`}
          onClick={toggleBotPanel}
        >
          <CloseIcon size={14} />
        </button>
      </header>
      <div className="bot-panel-body scroll">
        {group && <GroupPanel key={group.id} group={group} />}
        {bot && page.kind === "overview" && <BotOverview bot={bot} onPage={setPage} />}
        {bot && page.kind === "settings" && <BotSettings key={bot.id} bot={bot} />}
      </div>
      <ResizeHandle panel="inspector" />
    </aside>
  );
}
