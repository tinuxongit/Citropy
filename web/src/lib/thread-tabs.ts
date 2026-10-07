import { environmentStorage } from "./environment.ts";

const TABS_KEY = "citropy.tabs";
const CLOSED_TAB_LIMIT = 20;

const closedTabs: string[] = [];

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

type TabState = Tabs & { activeThreadId: string | null };

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

export function stepTab(openThreadIds: string[], id: string | null, step: number): string | null {
  if (!openThreadIds.length) return null;
  const index = id === null ? -1 : openThreadIds.indexOf(id);
  const from = index < 0 && step < 0 ? 0 : index;
  return openThreadIds.at((from + step) % openThreadIds.length)!;
}

export function rememberClosedTab(id: string): void {
  closedTabs.push(id);
  if (closedTabs.length > CLOSED_TAB_LIMIT) closedTabs.shift();
}

export function takeClosedTab(isOpenable: (id: string) => boolean): string | null {
  while (closedTabs.length) {
    const id = closedTabs.pop()!;
    if (isOpenable(id)) return id;
  }
  return null;
}
