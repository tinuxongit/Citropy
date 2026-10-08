import { serverUrl } from "../lib/environment.ts";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { CloseIcon } from "./icons/marks.tsx";
import { DownloadIcon } from "./icons/arrows.tsx";
import { FileIcon } from "./FileIcon.tsx";
import { MediaThumb } from "./MediaThumb.tsx";
import { Modal } from "./Modal.tsx";
import { FilePreview } from "./FilePreview.tsx";
import { ImageViewer } from "./ImageViewer.tsx";
import { VideoViewer } from "./VideoViewer.tsx";
import { assetQuery } from "../lib/api.ts";
import type { Attachment } from "../../../shared/protocol.ts";

export function Attachments({
  files,
  projectId,
  threadId,
  onRemove,
}: {
  files: Attachment[];
  projectId: string;
  threadId: string;
  onRemove?: (id: string) => void;
}) {
  const [preview, setPreview] = useState<Attachment>();
  const images = files.filter(file => file.mime?.startsWith("image/"));
  const media = (file: Attachment) => file.mime?.startsWith("image/") || file.mime?.startsWith("video/");
  return (
    <>
      <div className="attachments">
        {files.map((file) => (
          <div className="attachment" data-image={media(file) || undefined} key={file.id ?? file.path}>
            <button
              type="button"
              className="attachment-open"
              onClick={() => setPreview(file)}
              aria-label={`Preview ${file.label}`}
              title={`Preview ${file.label}`}
            >
              {media(file) ? (
                <MediaThumb
                  src={serverUrl(`/api/assets?${assetQuery(projectId, file.path, threadId, file.id)}`)}
                  alt={file.label}
                  video={file.mime?.startsWith("video/")}
                  size="tile"
                />
              ) : (
                <FileIcon path={file.label} mime={file.mime} size={22} className="attachment-file-icon" />
              )}
              {!media(file) && <span>
                <strong className="truncate">{file.label}</strong>
                <small>
                  {file.size !== undefined
                    ? file.size > 1024 * 1024
                      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                      : `${Math.max(1, Math.ceil(file.size / 1024))} KB`
                    : "File"}
                </small>
              </span>}
            </button>
            {onRemove && (
              <button
                type="button"
                className="icon-btn attachment-remove"
                aria-label={`Remove ${file.label}`}
                onClick={() => onRemove(file.id!)}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <AnimatePresence>{preview && (preview.mime?.startsWith("image/") ? <ImageViewer
        key="image-preview"
        images={images.map(file => ({ src: serverUrl(`/api/assets?${assetQuery(projectId, file.path, threadId, file.id)}`), name: file.label }))}
        index={images.findIndex(file => (file.id ?? file.path) === (preview.id ?? preview.path))}
        onIndexChange={index => setPreview(images[index])}
        onClose={() => setPreview(undefined)}
      /> : preview.mime?.startsWith("video/") ? <VideoViewer
        key="video-preview"
        src={serverUrl(`/api/assets?${assetQuery(projectId, preview.path, threadId, preview.id)}`)}
        download={serverUrl(`/api/assets?${assetQuery(projectId, preview.path, threadId, preview.id)}&download=1`)}
        name={preview.label}
        onClose={() => setPreview(undefined)}
      /> : (
        <Modal
          title={preview.label}
          icon={<FileIcon path={preview.label} mime={preview.mime} size={21} />}
          className="file-dialog"
          onClose={() => setPreview(undefined)}
          footer={
            <>
              <a
                className="btn"
                href={serverUrl(`/api/assets?${assetQuery(projectId, preview.path, threadId, preview.id)}&download=1`)}
                download={preview.label}
              >
                <DownloadIcon size={15} />
                Download
              </a>
              <button
                className="btn"
                type="button"
                data-cancel
                onClick={() => setPreview(undefined)}
              >
                Close
              </button>
            </>
          }
        >
          <FilePreview
            projectId={projectId}
            threadId={threadId}
            attachmentId={preview.id}
            path={preview.path}
            onClose={() => setPreview(undefined)}
            hideHeader
          />
        </Modal>
      ))}</AnimatePresence>
    </>
  );
}
