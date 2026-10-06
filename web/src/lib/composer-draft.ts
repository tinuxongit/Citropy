import { environmentStorage } from "./environment.ts";
import type { Attachment } from "../../../shared/protocol.ts";
import type { ComposerDraft } from "../../../shared/features.ts";

export function readDraft(threadId: string | null, scope: string): ComposerDraft {
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
