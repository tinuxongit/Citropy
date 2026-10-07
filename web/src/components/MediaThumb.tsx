import { useState } from "react";
import { ImageOff, Play } from "lucide-react";

const ICON_SIZES = {
  tile: { unavailable: 20, play: 14 },
  strip: { unavailable: 20, play: 22 },
  compact: { unavailable: 14, play: 12 },
} as const;
const VIDEO_POSTER_FRAGMENT = "#t=0.1";

export function MediaThumb({ src, alt, video = false, size }: { src: string; alt: string; video?: boolean; size: keyof typeof ICON_SIZES }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const fail = () => setFailedSrc(src);
  const icons = ICON_SIZES[size];
  if (failedSrc === src)
    return (
      <span className="image-unavailable" role="img" aria-label="Image unavailable">
        <ImageOff size={icons.unavailable} aria-hidden="true" />
        <span>Image unavailable</span>
      </span>
    );
  if (video)
    return (
      <span className="video-thumbnail">
        <video src={`${src}${VIDEO_POSTER_FRAGMENT}`} preload="metadata" muted playsInline aria-hidden="true" onError={fail} />
        <Play size={icons.play} fill="currentColor" aria-hidden="true" />
      </span>
    );
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={fail} />;
}
