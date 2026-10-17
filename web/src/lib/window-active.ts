import type { DesktopWindowState } from "../desktop.d.ts";

// Animations pause while the window is hidden or, in the desktop app, while another app has focus.
// Focus comes from Electron because the page's own blur event also fires when a browser panel or
// iframe inside the window takes focus.
const listeners = new Set<() => void>();
let focused = true;

export function windowActive(): boolean {
  return focused && !document.hidden;
}

export function onWindowActiveChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(): void {
  for (const listener of listeners) listener();
}

function applyWindowState(state: DesktopWindowState): void {
  const next = state.focused ?? true;
  if (next === focused) return;
  focused = next;
  update();
}

document.addEventListener("visibilitychange", update);
window.citropyDesktop?.onWindowState(applyWindowState);
void window.citropyDesktop?.windowState().then(applyWindowState);
