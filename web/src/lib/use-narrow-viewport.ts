import { useSyncExternalStore } from "react";
import { NARROW_VIEWPORT } from "./app-state.ts";
import { viewportWidth } from "./preferences.ts";

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

export const isNarrowViewport = () => viewportWidth() <= NARROW_VIEWPORT;

export function useNarrowViewport() {
  return useSyncExternalStore(subscribeResize, isNarrowViewport);
}
