import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { autoscrollDistance, canStartPointerDrag, followPointerDrag } from "./pointer-drag.ts";
import { movableSiblings, threadKey, type SidebarThread, type ThreadGroup } from "./thread-groups.ts";
import type { DropEdge } from "./use-project-order.ts";

interface ThreadDrop {
  id: string;
  edge: DropEdge;
}

export type ThreadDrag = ReturnType<typeof useThreadDrag>;

export function useThreadDrag({ viewport, groups, globalMode, disabled, resetKey, onDrop }: {
  viewport: RefObject<HTMLElement | null>;
  groups: ThreadGroup[];
  globalMode: boolean;
  disabled: boolean;
  resetKey: string;
  onDrop: (environment: string, source: string, target: string, edge: DropEdge) => void;
}) {
  const [dragging, setDragging] = useState<SidebarThread>();
  const [drop, setDrop] = useState<ThreadDrop>();
  const rowHeight = useRef(0);
  const suppressClick = useRef(false);
  const cancel = useRef(() => {});
  useEffect(() => () => cancel.current(), [resetKey]);

  const start = (event: ReactPointerEvent<HTMLElement>, item: SidebarThread) => {
    cancel.current();
    suppressClick.current = false;
    const control = (event.target as HTMLElement).closest("button, a, input, textarea");
    if (!canStartPointerDrag(event) || disabled || (control && !control.classList.contains("thread-row"))) return;
    const element = event.currentTarget;
    const scroll = viewport.current;
    const siblings = movableSiblings(groups, item, globalMode);
    if (!scroll || !siblings.length) return;
    const indices = new Map(siblings.map((sibling, index) => [sibling.thread.id, index]));
    const sourceIndex = indices.get(item.thread.id)!;
    const lastIndex = siblings.length - 1;
    const startY = event.clientY;
    const startScroll = scroll.scrollTop;
    rowHeight.current = element.parentElement!.offsetHeight;
    let lastTime = performance.now();
    let current: ThreadDrop | undefined;

    const measure = () => Array.from(scroll.querySelectorAll<HTMLElement>(".thread-entry")).flatMap((node) => {
      if (node.dataset.environment !== item.environment) return [];
      const id = node.dataset.threadId!;
      const index = indices.get(id);
      return index === undefined ? [] : [{ id, index, rect: node.parentElement!.getBoundingClientRect() }];
    });

    const target = (y: number, entries: ReturnType<typeof measure>, scrolled: number): ThreadDrop | undefined => {
      for (const { id, index, rect } of entries) {
        const top = rect.top - scrolled;
        const bottom = rect.bottom - scrolled;
        if ((y < top && index !== 0) || (y >= bottom && index !== lastIndex)) continue;
        if (id === item.thread.id) return undefined;
        const edge = y < top + rect.height / 2 ? "before" : "after";
        const destination = index + (edge === "after" ? 1 : 0) - (sourceIndex < index ? 1 : 0);
        return destination === sourceIndex ? undefined : { id, edge };
      }
      return undefined;
    };

    cancel.current = followPointerDrag(event, element, {
      begin: () => setDragging(item),
      step: ({ x, y }, now) => {
        const bounds = scroll.getBoundingClientRect();
        const inside = x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
        const distance = autoscrollDistance(y, bounds);
        const entries = measure();
        const source = entries.find((entry) => entry.id === item.thread.id);
        if (!source || !element.isConnected) {
          cancel.current();
          return false;
        }
        const first = entries.find((entry) => entry.index === 0);
        const last = entries.find((entry) => entry.index === lastIndex);
        const before = scroll.scrollTop;
        if (inside && distance) {
          const step = Math.max(-16, Math.min(16, distance * 0.4)) * Math.min(32, now - lastTime) / 16;
          const minimum = first ? Math.min(0, first.rect.top - bounds.top) : -Infinity;
          const maximum = last ? Math.max(0, last.rect.bottom - bounds.bottom) : Infinity;
          scroll.scrollTop += Math.max(minimum, Math.min(maximum, step));
        }
        lastTime = now;
        const scrolled = scroll.scrollTop - before;
        const next = inside ? target(y, entries, scrolled) : undefined;
        const sourceTop = source.rect.top - scrolled;
        const minimum = Math.max(bounds.top, first ? first.rect.top - scrolled : -Infinity);
        const maximum = Math.max(minimum, Math.min(bounds.bottom, last ? last.rect.bottom - scrolled : Infinity) - source.rect.height);
        const top = sourceTop + y - startY + scroll.scrollTop - startScroll;
        element.style.setProperty("--thread-drag-y", `${Math.max(minimum, Math.min(maximum, top)) - sourceTop}px`);
        if (current?.id !== next?.id || current?.edge !== next?.edge) {
          current = next;
          setDrop(next);
        }
        return scroll.scrollTop !== before;
      },
      end: (commit) => {
        element.style.removeProperty("--thread-drag-y");
        suppressClick.current = true;
        if (commit && current) onDrop(item.environment, item.thread.id, current.id, current.edge);
        setDragging(undefined);
        setDrop(undefined);
      },
    });
  };

  const shifts = useMemo(() => {
    const shifts = new Map<string, number>();
    if (!dragging || !drop) return shifts;
    const siblings = movableSiblings(groups, dragging, globalMode);
    const from = siblings.findIndex((item) => item.thread.id === dragging.thread.id);
    const target = siblings.findIndex((item) => item.thread.id === drop.id);
    if (from < 0 || target < 0) return shifts;
    const to = target + (drop.edge === "after" ? 1 : 0) - (from < target ? 1 : 0);
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
      if (index !== from) shifts.set(threadKey(dragging.environment, siblings[index]!.thread.id), from < to ? -rowHeight.current : rowHeight.current);
    }
    return shifts;
  }, [dragging, drop, groups, globalMode]);

  const suppressClickAfterDrag = (event: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return { draggingId: dragging && threadKey(dragging.environment, dragging.thread.id), shifts, start, suppressClickAfterDrag };
}
