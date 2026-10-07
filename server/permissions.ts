import { bus } from "./bus.ts";
import { uid } from "./ids.ts";
import { store } from "./store.ts";
import { describeTool } from "./tools.ts";
import type { PermissionRequest } from "../shared/protocol.ts";

export const ANSWER_WAIT_MS = 30 * 60 * 1000;

export const permissionToolName = "mcp__citropy__approve";

const decisions = ["allow", "allow_always", "deny"] as const;
type Decision = (typeof decisions)[number];

interface Pending {
  request: PermissionRequest;
  resolve: (decision: Decision) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();
const alwaysAllowed = new Map<string, Set<string>>();

export function pendingRequests(): PermissionRequest[] {
  return [...pending.values()].map((entry) => entry.request);
}

function settle(entry: Pending, decision: Decision): void {
  pending.delete(entry.request.id);
  clearTimeout(entry.timer);
  bus.emit({ t: "permission.close", id: entry.request.id });
  entry.resolve(decision);
}

export function answer(id: string, decision: Decision): void {
  if (!decisions.includes(decision)) throw new Error("Choose a valid permission decision.");
  const entry = pending.get(id);
  if (!entry) return;
  if (decision === "allow_always") {
    const set = alwaysAllowed.get(entry.request.threadId) ?? new Set<string>();
    set.add(entry.request.tool);
    alwaysAllowed.set(entry.request.threadId, set);
  }
  settle(entry, decision);
}

export function cancelThread(threadId: string, forgetAllowed = true): void {
  for (const entry of [...pending.values()]) if (entry.request.threadId === threadId) settle(entry, "deny");
  if (forgetAllowed) alwaysAllowed.delete(threadId);
}

export function ask(threadId: string, tool: string, input: unknown): Promise<Decision> {
  const thread = store.threads.get(threadId);
  if (!thread || thread.status === "stopped") return Promise.resolve("deny");
  if (alwaysAllowed.get(threadId)?.has(tool)) return Promise.resolve("allow");
  const project = store.projects.get(thread.projectId);
  const root = project?.path ?? "";
  const described = describeTool(tool, input, root);
  const request: PermissionRequest = {
    id: uid("prm"),
    threadId,
    tool,
    shape: described.shape,
    headline: described.headline,
    detail: described.detail,
    input,
    createdAt: Date.now(),
  };
  return new Promise<Decision>((resolve) => {
    const entry: Pending = { request, resolve, timer: setTimeout(() => settle(entry, "deny"), ANSWER_WAIT_MS) };
    entry.timer.unref();
    pending.set(request.id, entry);
    bus.emit({ t: "permission.request", request });
  });
}

bus.subscribe((event) => {
  if (event.t === "thread.remove") cancelThread(event.id);
});
