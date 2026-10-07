import { Minus, Plus } from "lucide-react";
import { ZOOM_STEP } from "../lib/use-viewer.ts";

export function ViewerZoom({ group, fit, scale, minimum, maximum, onZoom }: {
  group: string;
  fit: string;
  scale: number;
  minimum: number;
  maximum: number;
  onZoom: (next: number | null) => void;
}) {
  return <div className="image-zoom" role="group" aria-label={group}>
    <button className="icon-btn" type="button" aria-label="Zoom out" disabled={scale <= minimum} onClick={() => onZoom(scale / ZOOM_STEP)}><Minus size={18} /></button>
    <button className="image-zoom-reset" type="button" title={fit} aria-label={fit} onClick={() => onZoom(null)}>{Math.round(scale * 100)}%</button>
    <button className="icon-btn" type="button" aria-label="Zoom in" disabled={scale >= maximum} onClick={() => onZoom(scale * ZOOM_STEP)}><Plus size={18} /></button>
  </div>;
}
