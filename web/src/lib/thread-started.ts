import type { ThreadMeta } from "../../../shared/protocol.ts";
import { readDraft } from "./composer-draft.ts";
import { environmentId } from "./environment.ts";
import type { AppState } from "./store.ts";

export function threadStarted(thread: ThreadMeta, hasMessages: boolean, loaded: boolean): boolean {
  return hasMessages || (!loaded && Boolean(thread.usage.turns || thread.externalId || thread.branchedFrom || thread.transfers?.length));
}

export function isUnusedThread(state: AppState, id: string): boolean {
  const thread = state.threads[id];
  if (!thread || !state.loaded[id] || thread.parentThreadId || thread.running || thread.queue?.length) return false;
  if (threadStarted(thread, Boolean(state.order[id]?.length), false)) return false;
  const draft = readDraft(id, environmentId());
  return !draft.text.trim() && !draft.attachments.length;
}
