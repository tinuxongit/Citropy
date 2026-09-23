import { useEffect, useRef, useState } from "react";
import { serverUrl } from "../../lib/environment.ts";
import { reportError } from "../../lib/api.ts";
import { useI18n } from "../../lib/i18n.ts";
import type { Attachment } from "../../../../shared/protocol.ts";

const MAX_ATTACHMENTS = 8;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function useAttachmentUpload({
  threadId,
  scopeSignal,
  attachmentCount,
  onUploaded,
}: {
  threadId: string | null;
  scopeSignal: AbortSignal;
  attachmentCount: number;
  onUploaded: (attachment: Attachment) => void;
}) {
  const t = useI18n();
  const [uploading, setUploading] = useState("");
  const uploadAbort = useRef(new AbortController());
  useEffect(() => {
    uploadAbort.current = new AbortController();
    return () => uploadAbort.current.abort();
  }, []);
  const upload = async (files: File[]) => {
    if (!threadId || uploading) return;
    if (attachmentCount + files.length > MAX_ATTACHMENTS) {
      reportError(new Error(t("Attach up to 8 files per message.")));
      return;
    }
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES)
          throw new Error(t("{name} exceeds the 50 MB file limit.", { name: file.name }));
        setUploading(file.name);
        const response = await fetch(
          serverUrl(`/api/attachments?${new URLSearchParams({ threadId, name: file.name })}`),
          { method: "POST", body: file, signal: AbortSignal.any([uploadAbort.current.signal, scopeSignal]) },
        );
        const result = await response.json();
        scopeSignal.throwIfAborted();
        if (!response.ok) throw new Error(result.error || t("Upload failed."));
        onUploaded(result);
      }
    } catch (error) {
      reportError(error);
    } finally {
      setUploading("");
    }
  };
  return { uploading, upload };
}
