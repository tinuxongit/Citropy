const FRAME_MS = 120;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let shown = -1;

function tick(): void {
  const now = performance.now();
  const time = Math.floor(now / FRAME_MS) * FRAME_MS;
  if (time === shown) return;
  shown = time;
  for (const listener of listeners) listener();
}

function sync(): void {
  clearInterval(timer);
  timer = undefined;
  shown = -1;
  if (!listeners.size || document.hidden || reducedMotion.matches) return;
  tick();
  timer = setInterval(tick, FRAME_MS);
}

document.addEventListener("visibilitychange", sync);
reducedMotion.addEventListener("change", sync);

export function onAnimationTick(listener: () => void): () => void {
  listeners.add(listener);
  sync();
  return () => {
    listeners.delete(listener);
    sync();
  };
}

