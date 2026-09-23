import { useEffect } from "react";
import { send } from "../../lib/socket.ts";
import { useApp } from "../../lib/store.ts";

const SEARCH_DELAY = 200;

export function useThreadSearch(query: string, projectId: string | undefined) {
  const connected = useApp((state) => state.connected);
  const result = useApp((state) => state.searchResult);
  useEffect(() => {
    if (!query.trim() || !connected) return;
    const timer = setTimeout(() => send({ t: "thread.search", query, projectId }), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [query, projectId, connected]);
  return result?.query === query && result.projectId === projectId ? result.results : undefined;
}

export type SearchMatch = NonNullable<ReturnType<typeof useThreadSearch>>[number];
