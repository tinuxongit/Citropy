import { useEffect, useRef } from "react";
import { MOD } from "../../lib/modifier-key.ts";
import { useApp } from "../../lib/store.ts";
import { Search } from "../icons.ts";

export function ThreadSearch() {
  const query = useApp((state) => state.threadQuery);
  const focusPending = useApp((state) => state.threadSearchFocusPending);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusPending || !input.current!.checkVisibility()) return;
    input.current!.select();
    useApp.setState({ threadSearchFocusPending: false });
  }, [focusPending]);
  return (
    <label className="thread-search" title={`Find a conversation (${MOD}K)`}>
      <Search size={14} aria-hidden="true" />
      <input
        ref={input}
        aria-label="Find a conversation"
        placeholder="Search"
        value={query}
        onChange={(event) => useApp.setState({ threadQuery: event.target.value })}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          useApp.setState({ threadQuery: "" });
          event.currentTarget.blur();
        }}
      />
    </label>
  );
}
