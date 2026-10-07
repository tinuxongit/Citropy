import { useState } from "react";
import { useApp } from "../../lib/store.ts";
import { serverUrl } from "../../lib/environment.ts";
import { ImageViewer } from "../ImageViewer.tsx";
import { MediaThumb } from "../MediaThumb.tsx";
import type { ImagesPart } from "../../../../shared/protocol.ts";

export function ImageGallery({ part }: { part: ImagesPart }) {
  const projectId = useApp((state) => state.activeProjectId);
  const threadId = useApp((state) => state.activeThreadId);
  const [preview, setPreview] = useState<number | null>(null);
  if (!projectId || !threadId) return null;
  const url = (path: string) =>
    serverUrl(`/api/assets?${new URLSearchParams({ projectId, path, threadId })}`);
  return (
    <>
      <div className="image-gallery">
        {part.files.map((file, index) => (
          <button
            key={file.path}
            type="button"
            className="image-gallery-item"
            aria-label={`Preview ${file.label}`}
            title={file.label}
            onClick={() => setPreview(index)}
          >
            <MediaThumb src={url(file.path)} alt={file.label} size="tile" />
            <span className="truncate">{file.label}</span>
          </button>
        ))}
      </div>
      {preview !== null && part.files[preview] && (
        <ImageViewer
          images={part.files.map(file => ({ src: url(file.path), name: file.label }))}
          index={preview}
          onIndexChange={setPreview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
