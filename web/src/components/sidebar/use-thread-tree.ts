import { useMemo } from "react";
import type { ThreadMeta } from "../../../../shared/protocol.ts";

export type ThreadTree = ReturnType<typeof useThreadTree>;

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

export function useThreadTree(threads: Record<string, ThreadMeta>, activeThreadId: string | null) {
  const childrenByParent = useMemo(() => {
    const children = new Map<string, ThreadMeta[]>();
    for (const thread of Object.values(threads)) {
      if (!thread.parentThreadId) continue;
      const siblings = children.get(thread.parentThreadId);
      if (siblings) siblings.push(thread);
      else children.set(thread.parentThreadId, [thread]);
    }
    for (const siblings of children.values()) siblings.sort((a, b) => a.createdAt - b.createdAt);
    return children;
  }, [threads]);
  const selectedPath = useMemo(() => {
    const path = new Set<string>();
    ancestry(threads, activeThreadId ? threads[activeThreadId] : undefined, path);
    return path;
  }, [threads, activeThreadId]);
  const activePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const thread of Object.values(threads)) {
      if (thread.running || !["idle", "stopped"].includes(thread.status)) ancestry(threads, thread, paths);
    }
    return paths;
  }, [threads]);
  return { childrenByParent, selectedPath, activePaths };
}
