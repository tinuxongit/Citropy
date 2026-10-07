import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

export const ZOOM_STEP = 1.25;
const KEEP_OPEN = "button, a, .image-zoom";

export function useViewportBounds(viewport: RefObject<HTMLElement | null>) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setBounds({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport]);
  return bounds;
}

export function useCloseOnOutsideClick(viewport: RefObject<HTMLElement | null>, media: string, onClose: () => void) {
  useEffect(() => {
    const dialog = viewport.current?.closest("dialog");
    if (!dialog) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest(`${media}, ${KEEP_OPEN}`)) onClose();
    };
    dialog.addEventListener("click", closeOutside);
    return () => dialog.removeEventListener("click", closeOutside);
  }, [viewport, media, onClose]);
}
