import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { useCloseOnOutsideClick, useViewportBounds } from "../lib/use-viewer.ts";
import { Modal } from "./Modal.tsx";
import { VideoPlayer } from "./VideoPlayer.tsx";
import { ViewerZoom } from "./ViewerZoom.tsx";

const MIN_ZOOM = 0.25;

export function VideoViewer({ src, download, name, onClose }: { src: string; download: string; name: string; onClose: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const bounds = useViewportBounds(viewport);
  const [zoom, setZoom] = useState<number | null>(null);
  useCloseOnOutsideClick(viewport, ".video-player", onClose);
  const fit = size.width && bounds.width ? Math.min(bounds.width / size.width, bounds.height / size.height) : 1;
  const scale = zoom ?? fit;
  const minimum = Math.min(fit, MIN_ZOOM);
  const maximum = fit;
  const ready = size.width > 0;
  return <Modal
    title={name}
    className="image-viewer video-viewer"
    onClose={onClose}
    initialFocus=".video-player"
    actions={<a className="icon-btn" aria-label="Download video" title="Download video" href={download} download={name}><Download size={18} /></a>}
    footer={ready && <ViewerZoom group="Video zoom" fit="Fit video" scale={scale} minimum={minimum} maximum={maximum} onZoom={next => setZoom(next === null ? null : Math.min(maximum, Math.max(minimum, next)))} />}
  >
    <div className="image-viewport scroll" ref={viewport}>
      <div className="image-surface">
        <VideoPlayer
          src={src}
          name={name}
          style={ready ? { width: size.width * scale, height: size.height * scale } : { visibility: "hidden" }}
          onSize={(width, height) => setSize({ width, height })}
        />
      </div>
    </div>
  </Modal>;
}
