import { useEffect, useRef, useState } from "react";
import { environmentStorage } from "../../lib/environment.ts";
import { readDraft } from "../../lib/composer-draft.ts";
import type { Attachment } from "../../../../shared/protocol.ts";

export function useComposerDraft(threadId: string | null, scope: string) {
  const [draft] = useState(() => readDraft(threadId, scope));
  const [value, setValue] = useState(draft.text);
  const [attachments, setAttachments] = useState<Attachment[]>(
    draft.attachments,
  );
  const [quotes, setQuotes] = useState<string[]>(draft.quotes);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!threadId) return;
    const empty = !value && !attachments.length && !quotes.length;
    const save = () => {
      clearTimeout(timer);
      if (pending.current !== save) return;
      pending.current = null;
      if (empty) environmentStorage.removeItem(`citropy.draft.${threadId}`, scope);
      else environmentStorage.setItem(
        `citropy.draft.${threadId}`,
        JSON.stringify({ text: value, attachments, quotes }),
        scope,
      );
    };
    const timer = setTimeout(save, 300);
    pending.current = save;
    if (empty) save();
    return () => clearTimeout(timer);
  }, [threadId, value, attachments, quotes, scope]);
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
    setQuotes([]);
  };
  return { value, setValue, attachments, setAttachments, quotes, setQuotes, clearDraft };
}
