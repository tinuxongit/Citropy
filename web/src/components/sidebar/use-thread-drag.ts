import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { dropShifts, followListDrag, type ListDrop, type SlotBounds } from "./list-drag.ts";
import { canStartPointerDrag } from "./pointer-drag.ts";
import { movableSiblings, threadKey, type SidebarThread, type ThreadGroup } from "./thread-groups.ts";
import type { DropEdge } from "../../../../shared/move-beside.ts";

export type ThreadDrag = ReturnType<typeof useThreadDrag>;

const NO_SHIFTS = new Map<string, number>();

export function useThreadDrag({ viewport, groups, disabled, resetKey, onDrop }: {
  viewport: RefObject<HTMLElement | null>;
  groups: ThreadGroup[];
  disabled: boolean;
  resetKey: string;
  onDrop: (environment: string, source: string, target: string, edge: DropEdge) => void;
}) {
  const [dragging, setDragging] = useState<SidebarThread>();
  const [drop, setDrop] = useState<ListDrop>();
  const suppressClick = useRef(false);
  const cancel = useRef(() => {});
  useEffect(() => () => cancel.current(), [resetKey]);
  const latest = useRef({ groups, disabled, onDrop });
  latest.current = { groups, disabled, onDrop };

  const start = useCallback((event: ReactPointerEvent<HTMLElement>, item: SidebarThread) => {
    const { groups, disabled, onDrop } = latest.current;
    cancel.current();
    suppressClick.current = false;
    const control = (event.target as HTMLElement).closest("button, a, input, textarea");
    if (!canStartPointerDrag(event) || disabled || (control && !control.classList.contains("thread-row"))) return;
    const element = event.currentTarget;
    const scroll = viewport.current;
    const siblings = movableSiblings(groups, item);
    if (!scroll || !siblings.length) return;
    const indices = new Map(siblings.map((sibling, index) => [sibling.thread.id, index]));

    const measure = () => element.isConnected ? Array.from(scroll.querySelectorAll<HTMLElement>(".thread-entry")).flatMap((node): SlotBounds[] => {
      if (node.dataset.environment !== item.environment) return [];
      const id = node.dataset.threadId!;
      const index = indices.get(id);
      if (index === undefined) return [];
      const { top, bottom } = node.parentElement!.getBoundingClientRect();
      return [{ id, index, top, bottom }];
    }) : [];

    cancel.current = followListDrag(event, element, {
      scroll,
      sourceIndex: indices.get(item.thread.id)!,
      lastIndex: siblings.length - 1,
      measure,
      begin: () => setDragging(item),
      place: (offset) => element.style.setProperty("--thread-drag-y", `${offset}px`),
      change: setDrop,
      end: (drop) => {
        element.style.removeProperty("--thread-drag-y");
        suppressClick.current = true;
        if (drop) onDrop(item.environment, item.thread.id, drop.id, drop.edge);
        setDragging(undefined);
        setDrop(undefined);
      },
    });
  }, [viewport]);

  const shifts = useMemo(() => {
    if (!dragging || !drop) return NO_SHIFTS;
    const ids = movableSiblings(groups, dragging).map((item) => item.thread.id);
    return dropShifts(ids, dragging.thread.id, drop, (id) => threadKey(dragging.environment, id));
  }, [dragging, drop, groups]);

  const suppressClickAfterDrag = useCallback((event: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const draggingId = dragging && threadKey(dragging.environment, dragging.thread.id);
  return useMemo(() => ({ draggingId, shifts, start, suppressClickAfterDrag }), [draggingId, shifts, start, suppressClickAfterDrag]);
}
