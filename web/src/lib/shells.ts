import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ShellProcess } from "../../../shared/protocol.ts";
import { api } from "./api.ts";
import { isDevFake, stopFakeShell } from "./dev-triggers.ts";
import { useApp } from "./store.ts";

const LIST_AFTER_MS = 1000;

const isActiveShell = (shell: ShellProcess) => !shell.panelId && (shell.status === "running" || shell.status === "stopping");

export const shellStatus = (shell: ShellProcess) => shell.status === "stopping" ? "Stopping…" : shell.background ? "Background" : "Running";

export function useListedShells(threadId?: string): ShellProcess[] {
  const active = useApp(useShallow(state => Object.values(state.shells)
    .filter(shell => isActiveShell(shell) && (!threadId || shell.threadId === threadId))
    .sort((a, b) => b.startedAt - a.startedAt)));
  const seenAt = useRef<Map<string, number>>(undefined);
  seenAt.current ??= new Map(active.map(shell => [shell.id, -Infinity]));
  const now = Date.now();
  for (const shell of active) if (!seenAt.current.has(shell.id)) seenAt.current.set(shell.id, now);
  const [, setTick] = useState(0);
  const waiting = active.map(shell => seenAt.current!.get(shell.id)! + LIST_AFTER_MS - now).filter(ms => ms > 0);
  const nextIn = waiting.length ? Math.min(...waiting) : undefined;
  useEffect(() => {
    if (nextIn === undefined) return;
    const timer = window.setTimeout(() => setTick(tick => tick + 1), nextIn);
    return () => window.clearTimeout(timer);
  }, [nextIn]);
  return active.filter(shell => seenAt.current!.get(shell.id)! + LIST_AFTER_MS <= now);
}

export async function stopShell(id: string) {
  if (isDevFake(id)) return stopFakeShell(id);
  await api("shells/stop", { method: "POST", body: JSON.stringify({ id }) });
}
