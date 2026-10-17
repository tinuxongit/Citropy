import type { ThreadMeta } from "../../../shared/protocol.ts";
import type { AppState } from "./store.ts";

export function threadStarted(thread: ThreadMeta, hasMessages: boolean, loaded: boolean): boolean {
  return (
    hasMessages ||
    (!loaded &&
      Boolean(
        thread.usage.turns || thread.externalId || thread.branchedFrom || thread.transfers?.length,
      ))
  );
}

export function hasConversation(state: AppState, id: string): boolean {
  return Boolean(
    state.order[id]?.some((messageId) => state.messages[messageId]?.role !== "system"),
  );
}
