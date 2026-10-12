import { create } from "zustand";

export type BrowserSurface = { x: number; y: number; width: number; height: number; layer: number };

export const useBrowserSurfaces = create<{ byId: Record<string, BrowserSurface> }>(() => ({ byId: {} }));

export function showSurface(id: string, surface: BrowserSurface): void {
  useBrowserSurfaces.setState((state) => {
    const current = state.byId[id];
    if (current && (Object.keys(surface) as (keyof BrowserSurface)[]).every((key) => current[key] === surface[key])) return state;
    return { byId: { ...state.byId, [id]: surface } };
  });
}

export function hideSurface(id: string): void {
  useBrowserSurfaces.setState((state) => {
    if (!(id in state.byId)) return state;
    const { [id]: _, ...rest } = state.byId;
    return { byId: rest };
  });
}

export function fitScale(surface: BrowserSurface, pageWidth: number): number {
  return surface.width / pageWidth;
}
