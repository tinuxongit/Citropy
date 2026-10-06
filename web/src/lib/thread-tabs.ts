import { environmentStorage } from "./environment.ts";

const TABS_KEY = "citropy.tabs";

export interface Tabs {
  openThreadIds: string[];
  previewThreadId: string | null;
}

export function readTabs(id?: string): Tabs {
  const stored = JSON.parse(environmentStorage.getItem(TABS_KEY, id) ?? "null");
  const active = environmentStorage.getItem("citropy.thread", id);
  return stored ?? { openThreadIds: active ? [active] : [], previewThreadId: null };
}

export function saveTabs({ openThreadIds, previewThreadId }: Tabs): void {
  environmentStorage.setItem(TABS_KEY, JSON.stringify({ openThreadIds, previewThreadId }));
}

export function withPreviewTab(state: Tabs, id: string): Tabs {
  if (state.openThreadIds.includes(id)) return state;
  const preview = state.previewThreadId === null ? -1 : state.openThreadIds.indexOf(state.previewThreadId);
  const openThreadIds = preview < 0 ? [...state.openThreadIds, id] : state.openThreadIds.with(preview, id);
  return { openThreadIds, previewThreadId: id };
}

export function withKeptTab(state: Tabs, id: string): Tabs {
  if (!state.openThreadIds.includes(id)) return { ...state, openThreadIds: [...state.openThreadIds, id] };
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
