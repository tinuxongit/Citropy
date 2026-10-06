import { environmentStorage } from "./environment.ts";

export const TABS_KEY = "citropy.tabs";

export interface Tabs {
  openThreadIds: string[];
  previewThreadId: string | null;
}

type TabState = Tabs & { activeThreadId: string | null };

export function readTabs(id?: string): Tabs {
  const stored = JSON.parse(environmentStorage.getItem(TABS_KEY, id) ?? "null");
  const active = environmentStorage.getItem("citropy.thread", id);
  return stored ?? { openThreadIds: active ? [active] : [], previewThreadId: null };
}

export function saveTabs({ openThreadIds, previewThreadId }: Tabs): void {
  environmentStorage.setItem(TABS_KEY, JSON.stringify({ openThreadIds, previewThreadId }));
}

function afterActive(state: TabState, id: string): string[] {
  const openThreadIds = [...state.openThreadIds];
  const active = state.activeThreadId === null ? -1 : openThreadIds.indexOf(state.activeThreadId);
  openThreadIds.splice(active + 1, 0, id);
  return openThreadIds;
}

export function withPreviewTab(state: TabState, id: string): Tabs {
  if (state.openThreadIds.includes(id)) return state;
  const preview = state.previewThreadId === null ? -1 : state.openThreadIds.indexOf(state.previewThreadId);
  const openThreadIds = preview < 0 ? afterActive(state, id) : state.openThreadIds.with(preview, id);
  return { openThreadIds, previewThreadId: id };
}

export function withKeptTab(state: TabState, id: string): Tabs {
  if (!state.openThreadIds.includes(id)) return { ...state, openThreadIds: afterActive(state, id) };
  return state.previewThreadId === id ? { ...state, previewThreadId: null } : state;
}

export function withoutTab(state: Tabs, id: string): Tabs {
  return {
    openThreadIds: state.openThreadIds.filter((open) => open !== id),
    previewThreadId: state.previewThreadId === id ? null : state.previewThreadId,
  };
}

export function neighborTab(openThreadIds: string[], id: string): string | null {
  const index = openThreadIds.indexOf(id);
  const remaining = openThreadIds.filter((open) => open !== id);
  return remaining[Math.min(index, remaining.length - 1)] ?? null;
}
