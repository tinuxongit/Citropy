import { useEffect, useMemo, useRef, useState } from "react";
import { hasUsableAccount } from "../../../../shared/provider-account.ts";
import { openNewBotChat } from "../../lib/bots.ts";
import { entryText, orderedRoster, searchMatcher } from "../../lib/roster.ts";
import { useApp } from "../../lib/store.ts";
import { MOD } from "../../lib/modifier-key.ts";
import { useVisibleInterval } from "../../lib/use-visible-interval.ts";
import { Collapsible } from "../Collapsible.tsx";
import { SearchIcon } from "../icons/actions.tsx";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { CloseIcon, PlusIcon } from "../icons/marks.tsx";
import { ResizeHandle } from "../ResizeHandle.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { RosterRow } from "./RosterRow.tsx";

const ROW_TIME_REFRESH_MS = 60_000;

export function BotRoster({ onOpen }: { onOpen: () => void }) {
  const bots = useApp((state) => state.bots);
  const botGroups = useApp((state) => state.botGroups);
  const threads = useApp((state) => state.threads);
  const activeRosterId = useApp((state) => state.activeRosterId);
  const canCreate = useApp(
    (state) =>
      state.connected && Boolean(state.activeProjectId) && state.providers.some(hasUsableAccount),
  );
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const focusPending = useApp((state) => state.searchFocusPending);
  useEffect(() => {
    if (!focusPending || !search.current!.checkVisibility()) return;
    search.current!.select();
    useApp.setState({ searchFocusPending: false });
  }, [focusPending]);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  useVisibleInterval(() => setNow(Date.now()), ROW_TIME_REFRESH_MS);
  const { shown, hidden } = useMemo(() => {
    const { shown, hidden } = orderedRoster({ bots, botGroups, threads });
    const matches = searchMatcher(query);
    return {
      shown: shown.filter((entry) => matches(entryText(entry))),
      hidden: hidden.filter((entry) => matches(entryText(entry))),
    };
  }, [bots, botGroups, threads, query]);
  const empty = !shown.length && !hidden.length;
  return (
    <aside className="rail bot-roster" aria-label="Bots">
      <div className="thread-toolbar">
        <label className="thread-search">
          <SearchIcon size={16} />
          <input
            ref={search}
            aria-label="Find a bot or group"
            title={`Find a bot or group (${MOD}K)`}
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="thread-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <CloseIcon size={12} aria-hidden="true" />
            </button>
          )}
        </label>
        <button
          type="button"
          className="icon-btn bot-new"
          aria-label="New chat"
          title={`New chat (${MOD}N)`}
          disabled={!canCreate}
          onClick={openNewBotChat}
        >
          <PlusIcon size={16} />
        </button>
      </div>
      <div className="rail-scroll">
        <div className="rail-list scroll">
          <div className="bot-list sliding-selection">
            <SelectionHighlight
              value={activeRosterId ?? undefined}
              layout={[...shown, ...(hiddenOpen ? hidden : [])]
                .map((entry) => entry.item.id)
                .join()}
              selector='.bot-card[data-active="true"]'
            />
            {shown.map((entry) => (
              <RosterRow key={entry.item.id} entry={entry} now={now} onOpen={onOpen} />
            ))}
            {hidden.length > 0 && (
              <>
                <button
                  type="button"
                  className="bot-hidden-toggle"
                  aria-expanded={hiddenOpen || Boolean(query)}
                  onClick={() => setHiddenOpen((open) => !open)}
                >
                  <ChevronRightIcon size={12} />
                  Hidden
                  <span className="bot-hidden-count">{hidden.length}</span>
                </button>
                <Collapsible open={hiddenOpen || Boolean(query)} className="bot-hidden-list">
                  <div>
                    {hidden.map((entry) => (
                      <RosterRow key={entry.item.id} entry={entry} now={now} onOpen={onOpen} />
                    ))}
                  </div>
                </Collapsible>
              </>
            )}
          </div>
          {empty && query && <div className="rail-empty">Nothing matches your search.</div>}
        </div>
      </div>
      <ResizeHandle panel="sidebar" />
    </aside>
  );
}
