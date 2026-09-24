import type { ProviderId } from "./protocol.ts";

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
