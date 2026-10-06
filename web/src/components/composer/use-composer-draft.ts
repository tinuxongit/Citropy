import { useEffect, useRef, useState } from "react";
import { environmentStorage } from "../../lib/environment.ts";
import type { Attachment } from "../../../../shared/protocol.ts";
import type { ComposerDraft } from "../../../../shared/features.ts";

function readDraft(threadId: string | null, scope: string): ComposerDraft {
  const saved = JSON.parse(
    environmentStorage.getItem(`citropy.draft.${threadId}`, scope) || "{}",
  );
  return {
    text: typeof saved.text === "string" ? saved.text : "",
    attachments: Array.isArray(saved.attachments)
      ? saved.attachments
          .filter(
            (file: Attachment) =>
              file &&
              typeof file.id === "string" &&
              typeof file.path === "string",
          )
          .slice(0, 8)
      : [],
  };
}

export function useComposerDraft(threadId: string | null, scope: string) {
  const [draft] = useState(() => readDraft(threadId, scope));
  const [value, setValue] = useState(draft.text);
  const [attachments, setAttachments] = useState<Attachment[]>(
    draft.attachments,
  );
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!threadId) return;
    const save = () => {
      clearTimeout(timer);
      if (pending.current !== save) return;
      pending.current = null;
      environmentStorage.setItem(
        `citropy.draft.${threadId}`,
        JSON.stringify({ text: value, attachments }),
        scope,
      );
    };
    const timer = setTimeout(save, 300);
    pending.current = save;
    if (!value && !attachments.length) save();
    return () => clearTimeout(timer);
  }, [threadId, value, attachments, scope]);
  useEffect(() => {
    const save = () => pending.current?.();
    const hidden = () => { if (document.hidden) save(); };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const clearDraft = () => {
    pending.current = null;
    if (threadId) environmentStorage.removeItem(`citropy.draft.${threadId}`, scope);
    setValue("");
    setAttachments([]);
  };
  return { value, setValue, attachments, setAttachments, clearDraft };
}
