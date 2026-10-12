import { useApp } from "./store.ts";

function hideBootScreen(): void {
  const screen = document.getElementById("boot-screen");
  if (!screen) throw new Error("missing #boot-screen");
  screen.addEventListener("transitionend", () => screen.remove(), { once: true });
  screen.dataset.done = "";
}

export function hideBootScreenWhenConnected(): void {
  const stop = useApp.subscribe((state) => {
    if (!state.connected) return;
    stop();
    hideBootScreen();
  });
}
