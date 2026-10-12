import { useMemo, useState } from "react";
import { hasUsableAccount } from "../../../../shared/provider-account.ts";
import { reportError } from "../../lib/api.ts";
import { createBot } from "../../lib/bots.ts";
import { useApp } from "../../lib/store.ts";
import { useVisibleInterval } from "../../lib/use-visible-interval.ts";
import { Collapsible } from "../Collapsible.tsx";
import { SearchIcon } from "../icons/actions.tsx";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { CloseIcon, PlusIcon } from "../icons/marks.tsx";
import { ResizeHandle } from "../ResizeHandle.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { BotRow } from "./BotRow.tsx";
import { orderedBots } from "./bot-order.ts";

const ROW_TIME_REFRESH_MS = 60_000;

export function BotRoster({ onOpen }: { onOpen: () => void }) {
  const bots = useApp((state) => state.bots);
  const threads = useApp((state) => state.threads);
  const activeBotId = useApp((state) => state.activeBotId);
  const canCreate = useApp((state) => state.connected && Boolean(state.activeProjectId) && state.providers.some(hasUsableAccount));
  const [query, setQuery] = useState("");
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(Date.now);
  useVisibleInterval(() => setNow(Date.now()), ROW_TIME_REFRESH_MS);
  const { shown, hidden } = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const { shown, hidden } = orderedBots(bots, threads);
    const matches = (bot: typeof shown[number]) => words.every((word) =>
      `${bot.name} ${bot.title} ${bot.description} ${bot.preview ?? ""}`.toLowerCase().includes(word));
    return { shown: shown.filter(matches), hidden: hidden.filter(matches) };
  }, [bots, threads, query]);
  const create = () => {
    setCreating(true);
    void createBot().then(onOpen).catch(reportError).finally(() => setCreating(false));
  };
  const empty = !shown.length && !hidden.length;
  return (
    <aside className="rail bot-roster" aria-label="Bots">
      <div className="bot-roster-head">
        <button type="button" className="icon-btn bot-new" aria-label="New bot" title="New bot" disabled={!canCreate || creating} onClick={create}>
          <PlusIcon size={16} />
        </button>
      </div>
      <div className="thread-toolbar">
        <label className="thread-search">
          <SearchIcon size={16} />
          <input aria-label="Find a bot" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} />
          {query && <button type="button" className="thread-search-clear" aria-label="Clear search" onClick={() => setQuery("")}><CloseIcon size={12} aria-hidden="true" /></button>}
        </label>
      </div>
      <div className="rail-scroll">
        <div className="rail-list scroll">
          <div className="bot-list sliding-selection">
            <SelectionHighlight value={activeBotId ?? undefined} layout={[...shown, ...(hiddenOpen ? hidden : [])].map((bot) => bot.id).join()} selector='.bot-card[data-active="true"]' />
            {shown.map((bot) => <BotRow key={bot.id} bot={bot} now={now} onOpen={onOpen} />)}
            {hidden.length > 0 && <>
              <button type="button" className="bot-hidden-toggle" aria-expanded={hiddenOpen || Boolean(query)} onClick={() => setHiddenOpen((open) => !open)}>
                <ChevronRightIcon size={12} />
                Hidden bots
                <span className="bot-hidden-count">{hidden.length}</span>
              </button>
              <Collapsible open={hiddenOpen || Boolean(query)} className="bot-hidden-list">
                <div>{hidden.map((bot) => <BotRow key={bot.id} bot={bot} now={now} onOpen={onOpen} />)}</div>
              </Collapsible>
            </>}
          </div>
          {empty && <div className="rail-empty">{query ? "No bots match your search." : "No bots yet."}</div>}
        </div>
      </div>
      <ResizeHandle panel="sidebar" />
    </aside>
  );
}
