import { useMemo } from "react";
import type { ThreadMeta } from "../../../../shared/protocol.ts";

export interface ThreadTree {
  childrenByParent: Map<string, ThreadMeta[]>;
  selectedPath: Set<string>;
  activePaths: Set<string>;
}

function ancestry(threads: Record<string, ThreadMeta>, start: ThreadMeta | undefined, into: Set<string>): void {
  let thread = start;
  while (thread && !into.has(thread.id)) {
    into.add(thread.id);
    thread = thread.parentThreadId ? threads[thread.parentThreadId] : undefined;
  }
}

export function rootThread(threads: Record<string, ThreadMeta>, id: string | null): ThreadMeta | undefined {
  let thread = id ? threads[id] : undefined;
  while (thread?.parentThreadId) thread = threads[thread.parentThreadId];
  return thread;
}

export function useThreadTree(threadsByEnvironment: Record<string, Record<string, ThreadMeta>>, environment: string, activeThreadId: string | null): Record<string, ThreadTree> {
  return useMemo(() => Object.fromEntries(Object.entries(threadsByEnvironment).map(([id, threads]) => {
    const childrenByParent = new Map<string, ThreadMeta[]>();
    for (const thread of Object.values(threads)) {
      if (!thread.parentThreadId) continue;
      const siblings = childrenByParent.get(thread.parentThreadId);
      if (siblings) siblings.push(thread);
      else childrenByParent.set(thread.parentThreadId, [thread]);
    }
    for (const siblings of childrenByParent.values()) siblings.sort((a, b) => a.createdAt - b.createdAt);
    const selectedPath = new Set<string>();
    if (id === environment) ancestry(threads, activeThreadId ? threads[activeThreadId] : undefined, selectedPath);
    const activePaths = new Set<string>();
    for (const thread of Object.values(threads)) {
      if (thread.running || !["idle", "stopped"].includes(thread.status)) ancestry(threads, thread, activePaths);
    }
    return [id, { childrenByParent, selectedPath, activePaths }];
  })), [threadsByEnvironment, environment, activeThreadId]);
}
