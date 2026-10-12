import { useEffect, useRef, type RefObject } from "react";
import { hideSurface, showSurface } from "./browser-surfaces.ts";
import { movingAncestor } from "./overlays.ts";
import { useApp } from "./store.ts";

function stackingLayer(element: Element): number {
  let layer = 0;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const zIndex = Number.parseInt(getComputedStyle(node).zIndex);
    if (Number.isFinite(zIndex)) layer = zIndex;
  }
  return layer;
}

export function useBrowserSurface(id: string, frame: RefObject<HTMLElement | null>, shown: boolean): void {
  const uiScale = useApp((store) => store.uiScale);
  const reposition = useRef<() => void>(undefined);
  useEffect(() => reposition.current?.());
  useEffect(() => {
    const element = frame.current;
    if (!shown || !element) return;
    let scheduled = 0;
    const update = () => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0)
        showSurface(id, { x: box.x, y: box.y, width: box.width, height: box.height, layer: stackingLayer(element) });
      else hideSurface(id);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        update();
        if (movingAncestor(element)) schedule();
      });
    };
    update();
    reposition.current = schedule;
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    const onscreen = new IntersectionObserver(schedule, { threshold: [0, 1] });
    onscreen.observe(element);
    window.addEventListener("resize", schedule);
    return () => {
      resize.disconnect();
      onscreen.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(scheduled);
      reposition.current = undefined;
      hideSurface(id);
    };
  }, [shown, id, uiScale, frame]);
}
