import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { autoscrollDistance, canStartPointerDrag, followPointerDrag } from "./pointer-drag.ts";

const AUTOSCROLL_RATE = 0.3;
const AUTOSCROLL_MAX = 12;
const PICKABLE = ".thread-entry > .thread-card, .global-project-heading[data-project-id]";
const NOT_PICKABLE = '[role="menu"], dialog, [role="dialog"], [role="alertdialog"], input, textarea';
const KEEPS_PICKS = '.picked-actions, [role="menu"], dialog, [role="dialog"], [role="alertdialog"]';

export interface PickedRow {
  kind: "thread" | "project";
  environment: string;
  id: string;
}

const rowKey = (row: PickedRow) => `${row.kind}:${row.environment}:${row.id}`;

function rowOf(element: Element): PickedRow | undefined {
  const project = element.closest<HTMLElement>(".global-project-heading[data-project-id]");
  if (project) return { kind: "project", environment: project.dataset.environment!, id: project.dataset.projectId! };
  const thread = element.closest<HTMLElement>(".thread-entry");
  if (thread) return { kind: "thread", environment: thread.dataset.environment!, id: thread.dataset.threadId! };
  return undefined;
}

export function useRowPicking({ viewport, list, resetKey }: {
  viewport: RefObject<HTMLElement | null>;
  list: RefObject<HTMLElement | null>;
  resetKey: string;
}) {
  const [picked, setPicked] = useState<Map<string, PickedRow>>(new Map());
  const dragged = useRef(false);
  const cancel = useRef(() => {});
  const clear = () => setPicked(new Map());
  useEffect(() => {
    clear();
    return () => cancel.current();
  }, [resetKey]);
  useEffect(() => {
    let clickedInList = false;
    const press = (event: PointerEvent) => {
      clickedInList = viewport.current!.contains(event.target as Node);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Shift") {
        clickedInList = false;
        return;
      }
      if (clickedInList && viewport.current!.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
  useEffect(() => {
    if (!picked.size) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) clear();
    };
    const press = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest(KEEPS_PICKS)) return;
      if (event.shiftKey && viewport.current!.contains(target)) return;
      clear();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", press, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", press, true);
    };
  }, [picked.size]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (!event.shiftKey || target.closest(NOT_PICKABLE) || !canStartPointerDrag(event)) return;
    const listElement = list.current!;
    const scroll = viewport.current!;
    event.preventDefault();
    event.stopPropagation();
    cancel.current();
    dragged.current = false;
    const base = picked;
    const working = new Map(base);
    const toggle = (row: PickedRow) => {
      if (working.has(rowKey(row))) working.delete(rowKey(row));
      else working.set(rowKey(row), row);
    };
    const startRow = target.closest(PICKABLE) ? rowOf(target) : undefined;
    let current = startRow && rowKey(startRow);
    let lastY = event.clientY - listElement.getBoundingClientRect().top;
    cancel.current = followPointerDrag(event, scroll, {
      begin: () => {
        dragged.current = true;
        if (startRow) toggle(startRow);
        setPicked(new Map(working));
      },
      step: (pointer) => {
        const distance = autoscrollDistance(pointer.y, scroll.getBoundingClientRect());
        if (distance) scroll.scrollTop += Math.max(-AUTOSCROLL_MAX, Math.min(AUTOSCROLL_MAX, distance * AUTOSCROLL_RATE));
        const bounds = listElement.getBoundingClientRect();
        const y = pointer.y - bounds.top;
        const [from, to] = [Math.min(lastY, y), Math.max(lastY, y)];
        const previous = current;
        for (const element of listElement.querySelectorAll(PICKABLE)) {
          const rect = element.getBoundingClientRect();
          const top = rect.top - bounds.top;
          const bottom = rect.bottom - bounds.top;
          if (bottom <= from || top > to) continue;
          const row = rowOf(element)!;
          if (rowKey(row) !== previous) toggle(row);
          if (top <= y && y < bottom) current = rowKey(row);
        }
        lastY = y;
        setPicked(new Map(working));
        return distance !== 0;
      },
      end: (commit) => {
        if (!commit) setPicked(base);
      },
    });
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!event.shiftKey) return;
    const target = event.target as Element;
    if (target.closest(NOT_PICKABLE)) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const row = rowOf(target);
    if (!row) return;
    const next = new Map(picked);
    if (next.has(rowKey(row))) next.delete(rowKey(row));
    else next.set(rowKey(row), row);
    setPicked(next);
  };

  return {
    picked: [...picked.values()],
    isPicked: (row: PickedRow) => picked.has(rowKey(row)),
    clear,
    bind: { onPointerDownCapture, onClickCapture },
  };
}
