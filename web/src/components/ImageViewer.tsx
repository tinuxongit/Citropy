import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useCloseOnOutsideClick, useViewportBounds, ZOOM_STEP } from "../lib/use-viewer.ts";
import { Modal } from "./Modal.tsx";
import { ViewerZoom } from "./ViewerZoom.tsx";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_RATE = 0.01;

export type ViewerImage = { src: string; name: string };
type ZoomAnchor = { x: number; y: number; fx: number; fy: number };

export function ImageViewer({ images, index, onIndexChange, onClose }: {
  images: readonly ViewerImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const current = images[index];
  const src = current?.src ?? "";
  const name = current?.name ?? "";
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const anchor = useRef<ZoomAnchor | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pendingScale = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const bounds = useViewportBounds(viewport);
  const [zoom, setZoom] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    setSize({ width: 0, height: 0 });
    setZoom(null);
    pendingScale.current = null;
    setError(false);
    viewport.current?.scrollTo(0, 0);
  }, [src]);
  useCloseOnOutsideClick(viewport, "img", onClose);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof Element)) return;
      const dialog = viewport.current?.closest("dialog");
      const owner = event.target.closest("dialog") ?? document.querySelector("dialog:modal");
      if (!dialog?.open || owner !== dialog) return;
      const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : undefined;
      if (next === undefined) return;
      event.preventDefault();
      if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLButtonElement>(".dialog-heading button")?.focus();
      if (next >= 0 && next < images.length) onIndexChange(next);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [index, images.length, onIndexChange]);
  const fit = size.width && bounds.width ? Math.min(1, bounds.width / size.width, bounds.height / size.height) : 1;
  const scale = zoom ?? fit;
  const minimum = Math.min(fit, MIN_ZOOM);
  const ready = size.width > 0 && !error;
  const pannable = ready && (size.width * scale > bounds.width || size.height * scale > bounds.height);
  const zoomAt = (next: number | null, x: number, y: number) => {
    const box = image.current?.getBoundingClientRect();
    if (box?.width) anchor.current = { x, y, fx: (x - box.left) / box.width, fy: (y - box.top) / box.height };
    pendingScale.current = next === null ? null : Math.min(MAX_ZOOM, Math.max(minimum, next));
    setZoom(pendingScale.current);
  };
  const zoomAtCenter = (next: number | null) => {
    const box = viewport.current!.getBoundingClientRect();
    zoomAt(next, box.left + box.width / 2, box.top + box.height / 2);
  };
  useLayoutEffect(() => {
    const target = anchor.current;
    const box = image.current?.getBoundingClientRect();
    anchor.current = null;
    pendingScale.current = null;
    if (!target || !box) return;
    viewport.current!.scrollBy(box.left + target.fx * box.width - target.x, box.top + target.fy * box.height - target.y);
  }, [scale]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !ready) return;
    const zoomWithWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const factor = Math.min(ZOOM_STEP, Math.max(1 / ZOOM_STEP, Math.exp(-event.deltaY * WHEEL_ZOOM_RATE)));
      zoomAt((pendingScale.current ?? scale) * factor, event.clientX, event.clientY);
    };
    element.addEventListener("wheel", zoomWithWheel, { passive: false });
    return () => element.removeEventListener("wheel", zoomWithWheel);
  }, [ready, scale, minimum]);
  if (!current) return null;
  let download: string | undefined;
  if (URL.canParse(src, window.location.href)) {
    const url = new URL(src, window.location.href);
    if (["http:", "https:", "blob:"].includes(url.protocol) || /^data:image\//i.test(src)) download = src;
    if ((url.protocol === "http:" || url.protocol === "https:") && (url.pathname === "/api/assets" || url.pathname === "/api/tool-images")) {
      url.searchParams.set("download", "1");
      download = url.href;
    }
  }
  return <Modal
    title={name}
    className="image-viewer"
    onClose={onClose}
    initialFocus=".dialog-heading button"
    actions={<>
      {images.length > 1 && <span className="image-position" role="status" aria-label={`Image ${index + 1} of ${images.length}`}>{index + 1} / {images.length}</span>}
      {!error && download && <a className="icon-btn" aria-label="Download image" title="Download image" href={download} download={name}><Download size={18} /></a>}
    </>}
    footer={ready && <ViewerZoom group="Image zoom" fit="Fit image" scale={scale} minimum={minimum} maximum={MAX_ZOOM} onZoom={zoomAtCenter} />}
  >
    {images.length > 1 && <button className="icon-btn image-navigation" type="button" aria-label="Previous image" title="Previous image" aria-disabled={index === 0} onClick={() => { if (index > 0) onIndexChange(index - 1); }}><ChevronLeft size={24} /></button>}
    <div className="image-viewport scroll" ref={viewport} data-pannable={pannable || undefined}>
      {error ? <p className="image-viewer-error" role="alert">Unable to load this image.</p> : <div className="image-surface">
        <img
          key={src}
          ref={image}
          src={src}
          alt={name}
          draggable={false}
          style={ready ? { width: size.width * scale, height: size.height * scale } : { visibility: "hidden" }}
          onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setError(true)}
          onDoubleClick={(event) => zoomAt(zoom === null ? 1 : null, event.clientX, event.clientY)}
          onPointerDown={(event) => {
            if (!pannable || event.pointerType === "touch" || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            viewport.current!.scrollBy(drag.current.x - event.clientX, drag.current.y - event.clientY);
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        />
      </div>}
    </div>
    {images.length > 1 && <button className="icon-btn image-navigation" type="button" aria-label="Next image" title="Next image" aria-disabled={index === images.length - 1} onClick={() => { if (index < images.length - 1) onIndexChange(index + 1); }}><ChevronRight size={24} /></button>}
  </Modal>;
}
