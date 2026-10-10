import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { DropEdge } from "../../../shared/move-beside.ts";
import { dropShifts, type ListDrop } from "./sidebar/list-drag.ts";
import { canStartPointerDrag, followPointerDrag } from "./sidebar/pointer-drag.ts";

const VERTICAL_SLACK = 24;
const AUTOSCROLL_EDGE = 32;
const AUTOSCROLL_GAIN = 0.3;
const AUTOSCROLL_MAX_STEP = 12;

interface TabSlot {
  id: string;
  element: HTMLElement;
  left: number;
  width: number;
}

function tabSlots(list: HTMLElement): TabSlot[] {
  return Array.from(list.querySelectorAll<HTMLElement>("[data-tab-id]")).map((element) => ({
    id: element.dataset.tabId!,
    element,
    left: element.offsetLeft,
    width: element.offsetWidth,
  }));
}

function tabDrop(slots: TabSlot[], source: TabSlot, left: number, span: number): ListDrop | undefined {
  const sourceIndex = slots.indexOf(source);
  const others = slots.filter((slot) => slot !== source);
  const leadingEdge = (slot: TabSlot) => slot.left < source.left ? left : left + source.width;
  const index = others.filter((slot) => slot.left + slot.width / 2 < leadingEdge(slot)).length;
  if (index === sourceIndex) return undefined;
  return index < others.length ? { id: others[index]!.id, edge: "before", span } : { id: others.at(-1)!.id, edge: "after", span };
}

function glideToLayout(slots: TabSlot[], scale: number, reorder: () => void): void {
  const before = slots.map((slot) => slot.element.getBoundingClientRect().left);
  for (const { element } of slots) {
    element.style.transition = "none";
    element.style.removeProperty("transform");
  }
  flushSync(reorder);
  slots.forEach(({ element }, index) => {
    const offset = (before[index]! - element.getBoundingClientRect().left) / scale;
    if (offset) element.style.transform = `translateX(${offset}px)`;
  });
  void slots[0]?.element.offsetWidth;
  for (const { element } of slots) {
    element.style.removeProperty("transition");
    element.style.removeProperty("transform");
  }
}

export function useTabDrag({ strip, enabled, resetKey, onMove }: {
  strip: RefObject<HTMLElement | null>;
  enabled: boolean;
  resetKey: string;
  onMove: (id: string, targetId: string, edge: DropEdge) => void;
}) {
  const [dragging, setDragging] = useState<string>();
  const cancel = useRef(() => {});
  const dragged = useRef(false);

  useEffect(() => () => cancel.current(), [resetKey, enabled]);

  const start = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    cancel.current();
    dragged.current = false;
    const list = strip.current;
    if (!enabled || !list || !canStartPointerDrag(event)) return;
    const slots = tabSlots(list);
    const source = slots.find((slot) => slot.id === id);
    if (!source || slots.length < 2) return;
    const first = slots[0]!;
    const last = slots.at(-1)!;
    const gap = slots[1]!.left - first.left - first.width;
    const span = source.width + gap;
    const scale = source.element.getBoundingClientRect().width / source.width;
    const origin = event.clientX;
    const initialScroll = list.scrollLeft;
    let current: ListDrop | undefined;
    let shifts = new Map<string, number>();
    cancel.current = followPointerDrag(event, source.element, {
      begin: () => {
        source.element.style.transition = "none";
        setDragging(id);
      },
      step: ({ x, y }) => {
        const bounds = list.getBoundingClientRect();
        const inside = y >= bounds.top - VERTICAL_SLACK && y <= bounds.bottom + VERTICAL_SLACK;
        let distance = 0;
        if (inside && x < bounds.left + AUTOSCROLL_EDGE) distance = x - bounds.left - AUTOSCROLL_EDGE;
        else if (inside && x > bounds.right - AUTOSCROLL_EDGE) distance = x - bounds.right + AUTOSCROLL_EDGE;
        const previousScroll = list.scrollLeft;
        if (distance) list.scrollLeft += Math.max(-AUTOSCROLL_MAX_STEP, Math.min(AUTOSCROLL_MAX_STEP, distance * AUTOSCROLL_GAIN));
        const moved = (x - origin) / scale + list.scrollLeft - initialScroll;
        const offset = Math.max(first.left - source.left, Math.min(last.left + last.width - source.left - source.width, moved));
        source.element.style.transform = `translateX(${offset}px)`;
        current = inside ? tabDrop(slots, source, source.left + offset, span) : undefined;
        const next = current ? dropShifts(slots.map((slot) => slot.id), id, current) : new Map<string, number>();
        for (const slot of slots) {
          if (slot === source || next.get(slot.id) === shifts.get(slot.id)) continue;
          const shift = next.get(slot.id);
          if (shift) slot.element.style.transform = `translateX(${shift}px)`;
          else slot.element.style.removeProperty("transform");
        }
        shifts = next;
        return previousScroll !== list.scrollLeft;
      },
      end: (commit) => {
        dragged.current = true;
        const drop = current;
        if (commit && drop) {
          glideToLayout(slots, scale, () => {
            onMove(id, drop.id, drop.edge);
            setDragging(undefined);
          });
          return;
        }
        for (const { element } of slots) {
          element.style.removeProperty("transition");
          element.style.removeProperty("transform");
        }
        setDragging(undefined);
      },
    });
  };

  const suppressClickAfterDrag = (event: MouseEvent) => {
    if (!dragged.current || event.detail === 0) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { dragging, start, suppressClickAfterDrag };
}
