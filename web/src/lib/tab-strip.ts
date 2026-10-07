const NAVIGATION_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

export function nextTabIndex(key: string, index: number, count: number): number | undefined {
  if (!NAVIGATION_KEYS.includes(key)) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return (index + (key === "ArrowRight" ? 1 : -1) + count) % count;
}

export function scrollTabIntoView(strip: HTMLElement, tab: Element): void {
  const bounds = strip.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  if (rect.left < bounds.left) strip.scrollLeft -= bounds.left - rect.left;
  else if (rect.right > bounds.right) strip.scrollLeft += rect.right - bounds.right;
}
