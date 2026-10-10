import { createHash } from "node:crypto";
import { store } from "./store.ts";
import { providerLogRoots } from "./provider-logs.ts";
import { workspaceDirectory } from "./remote.ts";
import { listOpenCodeSessions, readOpenCodeSession } from "./session-import-opencode.ts";
import { readSession, scanSessionFiles } from "./session-import-jsonl.ts";
import type { ImportableSession, ImportProvider } from "../shared/session-import.ts";

const candidates = new Map<string, { provider: ImportProvider; path: string; root: string; sessionId: string }>();

function findImportedThread(provider: ImportProvider, sessionId: string) {
  return [...store.threads.values()].find(thread => thread.provider === provider && thread.externalId === sessionId);
}

function register(provider: ImportProvider, path: string, root: string, summary: Pick<ImportableSession, "sessionId" | "title" | "cwd" | "updatedAt">): ImportableSession {
  const id = createHash("sha256").update(`${provider}:${path}:${summary.sessionId}`).digest("hex");
  candidates.set(id, { provider, path, root, sessionId: summary.sessionId });
  return { id, provider, ...summary, importedThreadId: findImportedThread(provider, summary.sessionId)?.id };
}

export async function listImportableSessions(provider: ImportProvider): Promise<ImportableSession[]> {
  for (const [id, candidate] of candidates) if (candidate.provider === provider) candidates.delete(id);
  if (provider === "opencode") {
    const path = providerLogRoots("opencode")[0]!;
    return (await listOpenCodeSessions()).map(session => register(provider, path, path, session));
  }
  const output: ImportableSession[] = [];
  for (const file of await scanSessionFiles(provider)) {
    const data = await readSession(file.path, file.root, provider, true);
    if (!data) continue;
    output.push(register(provider, file.path, file.root, { sessionId: data.sessionId, title: data.title, cwd: data.cwd, updatedAt: file.updatedAt }));
  }
  return output;
}

export async function importSession(id: string): Promise<{ threadId: string; projectId: string }> {
  const candidate = candidates.get(id);
  if (!candidate) throw new Error("Refresh the session list and choose a session again.");
  const imported = findImportedThread(candidate.provider, candidate.sessionId);
  if (imported) return { threadId: imported.id, projectId: imported.projectId };
  const session = candidate.provider === "opencode" ? await readOpenCodeSession(candidate.sessionId)
    : await readSession(candidate.path, candidate.root, candidate.provider);
  if (!session) throw new Error("This session has no supported conversation history.");
  const path = await workspaceDirectory(session.cwd);
  const concurrent = findImportedThread(candidate.provider, session.sessionId);
  if (concurrent) return { threadId: concurrent.id, projectId: concurrent.projectId };
  if (store.disabledProviders.has(candidate.provider)) throw new Error("Enable this provider in Settings > Providers before importing.");
  const project = store.openProject(path);
  const thread = store.createThread({ projectId: project.id, provider: candidate.provider, externalId: session.sessionId, title: session.title, model: session.model, permissionMode: "manual" });
  store.replaceMessages(thread.id, session.messages);
  store.flush();
  return { threadId: thread.id, projectId: project.id };
}
