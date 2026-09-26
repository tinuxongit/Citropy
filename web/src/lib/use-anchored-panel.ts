import { useEffect, useLayoutEffect, type RefObject } from "react";
import { scaled, useApp, viewportWidth } from "./store.ts";

export function useAnchoredPanel(panel: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>, { open, width }: { open: boolean; width: number }) {
  const uiScale = useApp((state) => state.uiScale);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    if (!element.matches(":popover-open")) element.showPopover();
    const position = () => {
      const target = anchor.current?.getBoundingClientRect();
      if (!target) return;
      const scale = uiScale / 100;
      const size = Math.min(width, viewportWidth() - 24);
      element.style.width = `${scaled(size)}px`;
      element.style.left = `${scaled(Math.max(12, Math.min(target.right / scale - size, viewportWidth() - size - 12)))}px`;
      element.style.bottom = `${scaled((innerHeight - target.top) / scale + 8)}px`;
      element.style.maxHeight = `${scaled(Math.max(0, target.top / scale - 22))}px`;
    };
    position();
    const resize = new ResizeObserver(position);
    if (anchor.current) resize.observe(anchor.current);
    const surroundings = anchor.current?.closest(".composer");
    if (surroundings) resize.observe(surroundings);
    window.addEventListener("resize", position);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [open, width, uiScale, panel, anchor]);
}

export function useDismiss(panel: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>, onDismiss: () => void, { open, outside }: { open: boolean; outside: boolean }) {
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onDismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onDismiss();
    };
    if (outside) document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open, outside, onDismiss, panel, anchor]);
}
