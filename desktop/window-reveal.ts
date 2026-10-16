import type { BrowserWindow } from "electron";

export function revealDesktopWindow(window: BrowserWindow | null | undefined, { maximized = false } = {}) {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  if (maximized && !window.isMaximized()) window.maximize();
  window.focus();
}

export function prepareInitialWindowReveal(
  window: BrowserWindow,
  { maximized = false, platform = process.platform as string } = {},
) {
  let initial = true;
  const reveal = () => {
    if (!initial) return revealDesktopWindow(window);
    initial = false;
    window.removeListener("ready-to-show", reveal);
    revealDesktopWindow(window, { maximized });
  };
  if (platform === "linux") reveal();
  else window.once("ready-to-show", reveal);
  return reveal;
}

export function createSecondInstanceFocus(getFocus: () => (() => void) | null | undefined) {
  let pending = false;
  const focus = () => {
    const reveal = getFocus();
    if (!reveal) {
      pending = true;
      return;
    }
    reveal();
  };
  return {
    focus,
    flush() {
      if (!pending) return;
      pending = false;
      focus();
    },
  };
}
