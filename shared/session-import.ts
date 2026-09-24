export type ImportProvider = "claude" | "codex";

export interface ImportableSession {
  id: string;
  provider: ImportProvider;
  sessionId: string;
  title: string;
  cwd: string;
  updatedAt: number;
  importedThreadId?: string;
}
