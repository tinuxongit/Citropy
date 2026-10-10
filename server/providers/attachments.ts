import type { Attachment } from "../../shared/protocol.ts";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function isImage(file: Attachment): boolean {
  return IMAGE_TYPES.includes(file.mime ?? "");
}

export function attachmentNote(file: Attachment): string {
  return `Attached file: ${file.label}\nLocal path on this host: ${JSON.stringify(file.path)}\nThis uploaded file is stored outside the workspace. Read it at the path above.`;
}
