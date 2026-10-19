import { useApp } from "./store.ts";

// Matches the icon entrance in index.html, so a fast start doesn't cut the intro short.
const ENTRANCE_MS = 800;

function hideBootScreen(): void {
  const screen = document.getElementById("boot-screen");
  if (!screen) throw new Error("missing #boot-screen");
  screen.style.setProperty("--boot-progress", "1");
  setTimeout(
    () => {
      screen.addEventListener("transitionend", function done(event) {
        if (event.target !== screen) return;
        screen.removeEventListener("transitionend", done);
        screen.remove();
      });
      screen.dataset.done = "";
      // The app settles into place as the intro clears.
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        document.getElementById("root")?.animate(
          [
            { opacity: 0, transform: "scale(0.985)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: 520,
            delay: 60,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "backwards",
          },
        );
    },
    Math.max(0, ENTRANCE_MS - performance.now()),
  );
}

// Without this the splash waits silently forever when the server is down or unreachable.
const SLOW_MS = 8000;

export function hideBootScreenWhenConnected(): void {
  const slow = setTimeout(() => {
    const status = document.getElementById("boot-status");
    if (status) status.textContent = "Still waiting for the Citropy server…";
  }, SLOW_MS);
  const stop = useApp.subscribe((state) => {
    if (!state.connected) return;
    stop();
    clearTimeout(slow);
    hideBootScreen();
  });
}
