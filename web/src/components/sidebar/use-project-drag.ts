import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Project } from "../../../../shared/protocol.ts";
import { autoscrollDistance, canStartPointerDrag, followPointerDrag } from "./pointer-drag.ts";
import type { DropEdge } from "./use-project-order.ts";

export interface ProjectDrop {
  id: string;
  edge: DropEdge;
  top: number;
}

const sameDrop = (a: ProjectDrop | undefined, b: ProjectDrop | undefined) =>
  a?.id === b?.id && a?.edge === b?.edge && a?.top === b?.top;

function sectionBottom(list: HTMLElement, projectId: string): number {
  const rows = list.querySelectorAll<HTMLElement>(
    `[data-category="project:${CSS.escape(projectId)}"] :is(.global-project-heading, .thread-entry, .global-project-empty)`,
  );
  return Math.max(...Array.from(rows, (row) => row.getBoundingClientRect().bottom));
}

export function useProjectDrag({ viewport, list, projects, disabled, resetKey, onMove }: {
  viewport: RefObject<HTMLElement | null>;
  list: RefObject<HTMLElement | null>;
  projects: Project[];
  disabled: boolean;
  resetKey: string;
  onMove: (source: string, target: string, edge: DropEdge) => void;
}) {
  const [dragging, setDragging] = useState<string>();
  const [drop, setDrop] = useState<ProjectDrop>();
  const dragged = useRef(false);
  const cancel = useRef(() => {});
  useEffect(() => () => cancel.current(), [resetKey]);

  const start = (event: ReactPointerEvent<HTMLElement>, projectId: string) => {
    cancel.current();
    dragged.current = false;
    const listElement = list.current;
    const scroll = viewport.current;
    if (!canStartPointerDrag(event) || disabled || !listElement || !scroll) return;
    const ids = projects.map((project) => project.id);
    const source = ids.indexOf(projectId);
    let current: ProjectDrop | undefined;
    const target = (y: number): ProjectDrop | undefined => {
      const listTop = listElement.getBoundingClientRect().top;
      const headings = Array.from(listElement.querySelectorAll<HTMLElement>(".global-project-heading[data-project-id]"));
      const below = headings.find((heading) => {
        const rect = heading.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      const id = below ? below.dataset.projectId! : headings.at(-1)?.dataset.projectId;
      const edge = below ? "before" : "after";
      if (!id || id === projectId || ids.indexOf(id) === source + (edge === "before" ? 1 : -1)) return undefined;
      const top = below ? below.getBoundingClientRect().top - listTop - 3 : sectionBottom(listElement, id) - listTop + 1;
      return { id, edge, top: Math.max(0, top) };
    };
    cancel.current = followPointerDrag(event, event.currentTarget, {
      begin: () => setDragging(projectId),
      step: ({ y }) => {
        const distance = autoscrollDistance(y, scroll.getBoundingClientRect());
        if (distance) scroll.scrollTop += Math.max(-12, Math.min(12, distance * 0.3));
        const next = target(y);
        if (!sameDrop(current, next)) {
          current = next;
          setDrop(next);
        }
        return distance !== 0;
      },
      end: (commit) => {
        dragged.current = true;
        if (commit && current) onMove(projectId, current.id, current.edge);
        setDragging(undefined);
        setDrop(undefined);
      },
    });
  };

  const consumeDrag = (event: MouseEvent) => {
    const wasDragged = dragged.current && event.detail !== 0;
    dragged.current = false;
    return wasDragged;
  };

  return { dragging, drop, start, consumeDrag };
}
