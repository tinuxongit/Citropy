import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { dropShifts, followListDrag, type ListDrop, type SlotBounds } from "./list-drag.ts";
import { canStartPointerDrag } from "./pointer-drag.ts";
import type { ThreadGroup } from "./thread-groups.ts";
import type { DropEdge } from "../../../../shared/move-beside.ts";

const NO_SHIFTS = new Map<string, number>();

function layoutBounds(section: HTMLElement, virtualized: boolean): { top: number; bottom: number } | undefined {
  const boxes = virtualized ? Array.from(section.children as HTMLCollectionOf<HTMLElement>) : [section];
  let top = Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    const parentTop = box.offsetParent?.getBoundingClientRect().top ?? 0;
    top = Math.min(top, parentTop + box.offsetTop);
    bottom = Math.max(bottom, parentTop + box.offsetTop + box.offsetHeight);
  }
  return top < bottom ? { top, bottom } : undefined;
}

const siblingIds = (groups: ThreadGroup[], environment: string | undefined) =>
  groups.filter((entry) => entry.project && entry.environment === environment).map((entry) => entry.id);

export function useProjectDrag({ viewport, list, groups, disabled, resetKey, onMove }: {
  viewport: RefObject<HTMLElement | null>;
  list: RefObject<HTMLElement | null>;
  groups: ThreadGroup[];
  disabled: boolean;
  resetKey: string;
  onMove: (source: string, target: string, edge: DropEdge) => void;
}) {
  const [dragging, setDragging] = useState<string>();
  const [drop, setDrop] = useState<ListDrop>();
  const dragged = useRef(false);
  const cancel = useRef(() => {});
  useEffect(() => () => cancel.current(), [resetKey]);
  const latest = useRef({ groups, disabled, onMove });
  latest.current = { groups, disabled, onMove };

  const start = (event: ReactPointerEvent<HTMLElement>, projectId: string) => {
    const { groups, disabled, onMove } = latest.current;
    cancel.current();
    dragged.current = false;
    const listElement = list.current;
    const scroll = viewport.current;
    const group = groups.find((entry) => entry.id === projectId);
    if (!canStartPointerDrag(event) || disabled || !listElement || !scroll || !group) return;
    const ids = siblingIds(groups, group.environment);
    const indices = new Map(ids.map((id, index) => [id, index]));
    const wasOpen = group.open;
    let section: HTMLElement | null = null;

    const measure = () => {
      if (!section?.isConnected) return [];
      const virtualized = listElement.dataset.virtualized === "true";
      return Array.from(listElement.querySelectorAll<HTMLElement>(".thread-category[data-tree]")).flatMap((node): SlotBounds[] => {
        const id = node.dataset.category!;
        const index = indices.get(id);
        if (index === undefined) return [];
        const bounds = layoutBounds(node, virtualized);
        return bounds ? [{ id, index, ...bounds }] : [];
      });
    };

    cancel.current = followListDrag(event, event.currentTarget, {
      scroll,
      sourceIndex: indices.get(projectId)!,
      lastIndex: ids.length - 1,
      measure,
      begin: () => {
        flushSync(() => {
          setDragging(projectId);
          if (wasOpen) group.toggle();
        });
        section = listElement.querySelector<HTMLElement>(`.thread-category[data-category="${CSS.escape(projectId)}"]`);
      },
      place: (offset) => section?.style.setProperty("--project-drag-y", `${offset}px`),
      change: setDrop,
      end: (drop) => {
        section?.style.removeProperty("--project-drag-y");
        dragged.current = true;
        if (drop) onMove(projectId, drop.id, drop.edge);
        if (wasOpen) latest.current.groups.find((entry) => entry.id === projectId && !entry.open)?.toggle();
        setDragging(undefined);
        setDrop(undefined);
      },
    });
  };

  const shifts = useMemo(() => {
    const source = groups.find((entry) => entry.id === dragging);
    if (!source || !drop) return NO_SHIFTS;
    return dropShifts(siblingIds(groups, source.environment), source.id, drop);
  }, [dragging, drop, groups]);

  const consumeDrag = (event: MouseEvent) => {
    const wasDragged = dragged.current && event.detail !== 0;
    dragged.current = false;
    return wasDragged;
  };

  return { dragging, shifts, start, consumeDrag };
}
