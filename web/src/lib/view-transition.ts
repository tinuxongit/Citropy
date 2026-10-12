import type { AppState } from "./app-state.ts";
import { useApp } from "./store.ts";

type View = AppState["activeView"];

let pending: { view: View; shown: () => void } | undefined;

function ignoreSkipped(error: unknown): void {
  if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
}

export function transitionView(view: View, change: () => void): void {
  if (pending) {
    pending.view = view;
    change();
    return;
  }
  if (useApp.getState().activeView === view) {
    change();
    return;
  }
  const transition = document.startViewTransition(() => new Promise<void>(shown => {
    pending = { view, shown };
    change();
  }));
  transition.ready.catch(ignoreSkipped);
}

export function viewShown(view: View): void {
  if (pending?.view !== view) return;
  pending.shown();
  pending = undefined;
}
