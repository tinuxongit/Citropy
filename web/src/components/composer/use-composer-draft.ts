import { useEffect, useState } from "react";
import { environmentStorage } from "../../lib/environment.ts";
import type { Attachment } from "../../../../shared/protocol.ts";
import type { ComposerDraft } from "../../../../shared/features.ts";

function readDraft(threadId: string | null, scope: string): ComposerDraft {
  try {
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
  } catch {
    return { text: "", attachments: [] };
  }
}

export function useComposerDraft(threadId: string | null, scope: string) {
  const [draft] = useState(() => readDraft(threadId, scope));
  const [value, setValue] = useState(draft.text);
  const [attachments, setAttachments] = useState<Attachment[]>(
    draft.attachments,
  );
  useEffect(() => {
    if (threadId)
      environmentStorage.setItem(
        `citropy.draft.${threadId}`,
        JSON.stringify({ text: value, attachments }),
        scope,
      );
  }, [threadId, value, attachments, scope]);
  return { value, setValue, attachments, setAttachments };
}
