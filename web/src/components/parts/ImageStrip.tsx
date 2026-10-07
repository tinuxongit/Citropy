import { useMemo, useState } from "react";
import { useApp } from "../../lib/store.ts";
import { serverUrl } from "../../lib/environment.ts";
import { ImageViewer } from "../ImageViewer.tsx";
import { MediaThumb } from "../MediaThumb.tsx";
import { VideoViewer } from "../VideoViewer.tsx";
import type { ToolPart } from "../../../../shared/protocol.ts";

const VIDEO_FILE = /\.(mp4|webm|mov)$/i;

export function ImageStrip({ part, compact = false }: { part: ToolPart; compact?: boolean }) {
  const projectId = useApp((state) => state.activeProjectId);
  const threadId = useApp((state) => state.activeThreadId);
  const [preview, setPreview] = useState<string | null>(null);
  const sources = useMemo(() => {
    const collected = new Map<string, { src: string; name: string; video: boolean }>();
    if (part.images?.length) {
      for (const image of part.images)
        collected.set(image.id, {
          src: serverUrl(`/api/tool-images?threadId=${encodeURIComponent(threadId ?? "")}&id=${encodeURIComponent(image.id)}`),
          name: part.headline || part.name,
          video: false,
        });
    } else {
      for (const file of part.imageFiles ?? [])
        collected.set(file.path, {
          src: serverUrl(`/api/assets?${new URLSearchParams({ projectId: projectId ?? "", threadId: threadId ?? "", path: file.path })}`),
          name: file.label,
          video: VIDEO_FILE.test(file.path),
        });
    }
    return [...collected.entries()].map(([key, value]) => ({ key, ...value }));
  }, [part.images, part.imageFiles, part.headline, part.name, projectId, threadId]);
  if (!sources.length) return null;
  const images = sources.filter((source) => !source.video);
  const previewIndex = images.findIndex((source) => source.key === preview);
  const previewVideo = sources.find((source) => source.video && source.key === preview);
  return (
    <>
      <div className="image-strip" data-compact={compact || undefined} data-tool-id={part.id}>
        {sources.map((source) => (
          <button
            key={source.key}
            type="button"
            aria-label={`Preview ${source.name}`}
            title={source.name}
            onClick={() => setPreview(source.key)}
          >
            <MediaThumb src={source.src} alt={source.name} video={source.video} size={compact ? "compact" : "strip"} />
          </button>
        ))}
      </div>
      {previewIndex >= 0 && (
        <ImageViewer
          images={images}
          index={previewIndex}
          onIndexChange={index => setPreview(images[index]?.key ?? null)}
          onClose={() => setPreview(null)}
        />
      )}
      {previewVideo && (
        <VideoViewer
          src={previewVideo.src}
          download={`${previewVideo.src}&download=1`}
          name={previewVideo.name}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
