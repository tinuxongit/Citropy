import type { PointerEvent as ReactPointerEvent } from "react";
import { autoscrollDistance, followPointerDrag } from "./pointer-drag.ts";
import type { DropEdge } from "../../../../shared/move-beside.ts";

const AUTOSCROLL_GAIN = 0.4;
const AUTOSCROLL_MAX_STEP = 16;
const FRAME_MS = 16;
const MAX_FRAME_MS = 32;

export interface ListDrop {
  id: string;
  edge: DropEdge;
  span: number;
}

export interface SlotBounds {
  id: string;
  index: number;
  top: number;
  bottom: number;
}

function findDropSlot(y: number, entries: SlotBounds[], sourceIndex: number, lastIndex: number): Omit<ListDrop, "span"> | undefined {
  for (const { id, index, top, bottom } of entries) {
    if ((y < top && index !== 0) || (y >= bottom && index !== lastIndex)) continue;
    if (index === sourceIndex) return undefined;
    const edge: DropEdge = y < (top + bottom) / 2 ? "before" : "after";
    const destination = index + (edge === "after" ? 1 : 0) - (sourceIndex < index ? 1 : 0);
    return destination === sourceIndex ? undefined : { id, edge };
  }
  return undefined;
}

export function dropShifts(ids: string[], sourceId: string, drop: ListDrop, keyOf: (id: string) => string = (id) => id): Map<string, number> {
  const shifts = new Map<string, number>();
  const from = ids.indexOf(sourceId);
  const target = ids.indexOf(drop.id);
  if (from < 0 || target < 0) return shifts;
  const to = target + (drop.edge === "after" ? 1 : 0) - (from < target ? 1 : 0);
  for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
    if (index !== from) shifts.set(keyOf(ids[index]!), from < to ? -drop.span : drop.span);
  }
  return shifts;
}

export function followListDrag(event: ReactPointerEvent, handle: HTMLElement, { scroll, sourceIndex, lastIndex, measure, begin, place, change, end }: {
  scroll: HTMLElement;
  sourceIndex: number;
  lastIndex: number;
  measure: () => SlotBounds[];
  begin: () => void;
  place: (offset: number) => void;
  change: (drop: ListDrop | undefined) => void;
  end: (drop: ListDrop | undefined) => void;
}): () => void {
  const startY = event.clientY;
  const startScroll = scroll.scrollTop;
  let lastTime = performance.now();
  let current: ListDrop | undefined;
  const stop = followPointerDrag(event, handle, {
    begin,
    step: ({ x, y }, now) => {
      const bounds = scroll.getBoundingClientRect();
      const inside = x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
      const distance = autoscrollDistance(y, bounds);
      const entries = measure();
      const source = entries.find((entry) => entry.index === sourceIndex);
      if (!source) {
        stop();
        return false;
      }
      const first = entries.find((entry) => entry.index === 0);
      const last = entries.find((entry) => entry.index === lastIndex);
      const before = scroll.scrollTop;
      if (inside && distance) {
        const step = Math.max(-AUTOSCROLL_MAX_STEP, Math.min(AUTOSCROLL_MAX_STEP, distance * AUTOSCROLL_GAIN)) * Math.min(MAX_FRAME_MS, now - lastTime) / FRAME_MS;
        const minimum = first ? Math.min(0, first.top - bounds.top) : -Infinity;
        const maximum = last ? Math.max(0, last.bottom - bounds.bottom) : Infinity;
        scroll.scrollTop += Math.max(minimum, Math.min(maximum, step));
      }
      lastTime = now;
      const scrolled = scroll.scrollTop - before;
      const span = source.bottom - source.top;
      const slot = inside ? findDropSlot(y + scrolled, entries, sourceIndex, lastIndex) : undefined;
      const next = slot && { ...slot, span };
      const sourceTop = source.top - scrolled;
      const minimum = Math.max(bounds.top, first ? first.top - scrolled : -Infinity);
      const maximum = Math.max(minimum, Math.min(bounds.bottom, last ? last.bottom - scrolled : Infinity) - span);
      const top = sourceTop + y - startY + scroll.scrollTop - startScroll;
      place(Math.max(minimum, Math.min(maximum, top)) - sourceTop);
      if (current?.id !== next?.id || current?.edge !== next?.edge || current?.span !== next?.span) {
        current = next;
        change(next);
      }
      return scroll.scrollTop !== before;
    },
    end: (commit) => end(commit ? current : undefined),
  });
  return stop;
}
