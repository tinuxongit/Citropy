import { useEffect } from "react";
import { environmentId } from "../../lib/environment.ts";
import { sendTo, useBackgroundEnvironments } from "../../lib/live-environments.ts";
import { send } from "../../lib/socket.ts";
import { useApp } from "../../lib/store.ts";

const SEARCH_DELAY = 200;

export function useThreadSearch(query: string) {
  const connected = useApp((state) => state.connected);
  const result = useApp((state) => state.searchResult);
  const background = useBackgroundEnvironments();
  const environments = Object.entries(background).filter(([, slice]) => slice.connected).map(([id]) => id).join("\0");
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      if (connected) send({ t: "thread.search", query });
      for (const id of environments.split("\0").filter(Boolean)) sendTo(id, { t: "thread.search", query });
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [query, connected, environments]);
  const focused = result?.query === query ? result.results.map((match) => ({ ...match, environment: environmentId() })) : [];
  const others = Object.entries(background).flatMap(([environment, slice]) =>
    slice.connected && slice.searchResult?.query === query
      ? slice.searchResult.results.map((match) => ({ ...match, environment }))
      : [],
  );
  return focused.length || others.length || (connected && result?.query === query) || Object.values(background).some((slice) => slice.connected && slice.searchResult?.query === query)
    ? [...focused, ...others]
    : undefined;
}

export type SearchMatch = NonNullable<ReturnType<typeof useThreadSearch>>[number];
