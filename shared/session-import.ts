import type { ProviderId } from "./protocol.ts";

export const IMPORT_LIST_LIMIT = 200;
export const IMPORT_MAX_BYTES = 32 * 1024 * 1024;
export const IMPORT_TOO_LARGE = `This session exceeds the ${IMPORT_MAX_BYTES / 1024 / 1024} MB import limit.`;
export const IMPORT_DEFAULT_TITLE = "Imported conversation";
export const IMPORT_ATTACHMENT_NOTE = "[Attachment in original provider session]";

export type ImportProvider = ProviderId;

export interface ImportableSession {
  id: string;
  provider: ImportProvider;
  sessionId: string;
  title: string;
  cwd: string;
  updatedAt: number;
  importedThreadId?: string;
}
