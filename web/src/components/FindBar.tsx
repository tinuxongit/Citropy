import { useEffect, useRef, useState, type RefObject } from "react";
import { reportError } from "../lib/api.ts";
import { closeChatFind, findInThread } from "../lib/find-in-chat.ts";
import { useApp } from "../lib/store.ts";
import { clearHighlights, highlightText } from "../lib/text-highlight.ts";
import { SearchIcon } from "./icons/actions.tsx";
import { ChevronDownIcon, ChevronUpIcon } from "./icons/chevrons.tsx";
import { CloseIcon } from "./icons/marks.tsx";

const SEARCH_DELAY_MS = 200;
const HIGHLIGHTS = { match: "find-match", current: "find-current" };
const MESSAGE_TEXT = ".message-bubble";

export function FindBar({ threadId, viewport }: { threadId: string; viewport: RefObject<HTMLElement | null> }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; ids: string[] }>({ query: "", ids: [] });
  const [index, setIndex] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const needle = query.trim();
  const currentId = found.ids[index];

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (!needle) {
      setFound({ query: "", ids: [] });
      return;
    }
    let stale = false;
    const timer = setTimeout(() => void findInThread(threadId, needle).then((ids) => {
      if (stale) return;
      setFound({ query: needle, ids });
      setIndex(ids.length - 1);
      if (ids.length) useApp.setState({ searchMessageId: ids.at(-1)! });
    }, reportError), SEARCH_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [threadId, needle]);

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const inCurrent = (node: Node) => Boolean(currentId) && node.parentElement?.closest(".timeline-row")?.getAttribute("data-message-id") === currentId;
    const inMessage = (node: Node) => Boolean(node.parentElement?.closest(MESSAGE_TEXT));
    let frame = 0;
    const paint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => highlightText(root, found.query, HIGHLIGHTS, { include: inMessage, isCurrent: inCurrent }));
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearHighlights(HIGHLIGHTS.match, HIGHLIGHTS.current);
    };
  }, [viewport, found.query, currentId]);

  const step = (offset: number) => {
    if (!found.ids.length) return;
    const next = (index + offset + found.ids.length) % found.ids.length;
    setIndex(next);
    useApp.setState({ searchMessageId: found.ids[next]! });
  };
  const searched = Boolean(needle) && found.query === needle;

  return (
    <div className="find-bar" role="search">
      <label className="thread-search">
        <SearchIcon size={14} aria-hidden="true" />
        <input
          ref={input}
          aria-label="Find in conversation"
          placeholder="Find in conversation"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeChatFind();
            else if (event.key === "Enter") step(event.shiftKey ? 1 : -1);
            else return;
            event.preventDefault();
          }}
        />
      </label>
      <span className="find-count" aria-live="polite">{searched ? found.ids.length ? `${index + 1} of ${found.ids.length}` : "No results" : ""}</span>
      <button type="button" className="icon-btn" aria-label="Older match" title="Older match (Enter)" disabled={!found.ids.length} onClick={() => step(-1)}>
        <ChevronUpIcon size={14} />
      </button>
      <button type="button" className="icon-btn" aria-label="Newer match" title="Newer match (Shift+Enter)" disabled={!found.ids.length} onClick={() => step(1)}>
        <ChevronDownIcon size={14} />
      </button>
      <button type="button" className="icon-btn" aria-label="Close find" title="Close (Esc)" onClick={closeChatFind}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
