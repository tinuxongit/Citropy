const settled = new Set<() => void>();
let timer: number | undefined;

export function panelMoving(): boolean {
  return timer !== undefined;
}

export function markPanelMotion(duration: number): void {
  if (!duration) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    for (const listener of settled) listener();
  }, duration);
}

export function onPanelSettled(listener: () => void): () => void {
  settled.add(listener);
  return () => settled.delete(listener);
}
