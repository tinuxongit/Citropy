import { useState } from "react";
import { useApp } from "../../lib/store.ts";
import { api, reportError } from "../../lib/api.ts";
import { manageGit } from "../../lib/actions.ts";
import { gitActionBusy, type GitActionState } from "../../../../shared/assistance.ts";
import type { ThreadMeta } from "../../../../shared/protocol.ts";

type Pending = GitActionState["action"] | "pull" | "switchBranch" | "init";

const activities: Record<Pending, string> = {
  commit: "Writing commit…",
  commitPush: "Writing commit…",
  push: "Pushing…",
  pull: "Pulling…",
  switchBranch: "Switching branch…",
  init: "Initializing Git…",
};

export function useGitActions(thread: ThreadMeta) {
  const connected = useApp((state) => state.connected);
  const status = useApp((state) => state.git[thread.id] ?? state.git[thread.projectId]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const state = thread.gitAction;
  const busy = Boolean(pending) || gitActionBusy(state);
  const blocked = !connected || thread.running || thread.status === "awaiting" || busy;
  const scope = status?.files.some((file) => file.staged) ? "staged" : "all";
  const staged = status?.files.filter((file) => file.staged).length ?? 0;
  const hasChanges = Boolean(status && !status.clean);
  const canPush = Boolean(status && status.upstream !== null && status.ahead > 0 && status.behind === 0);
  const failed = !busy && Boolean(error || state?.status === "error");
  const activity = state?.status === "pushing" ? activities.push : state?.status === "committing" ? "Committing…" : state?.status === "generating" ? activities.commit : pending ? activities[pending] : "";

  const track = async (action: Pending, work: () => Promise<unknown>) => {
    setPending(action);
    setError("");
    try { await work(); }
    catch (error) { setError((error as Error).message); }
    finally { setPending(null); }
  };
  const run = (action: GitActionState["action"]) => track(action, () =>
    api(`threads/git-action?threadId=${encodeURIComponent(thread.id)}`, { method: "POST", body: JSON.stringify({ action, scope }) }));
  const manage = (operation: "pull" | "switchBranch" | "init", value?: string) => track(operation, () =>
    manageGit(thread.projectId, operation, value, undefined, undefined, thread.id));
  const dismissError = () => {
    setError("");
    if (state?.status === "error") void api(`threads/git-action?threadId=${encodeURIComponent(thread.id)}`, { method: "DELETE" }).catch(reportError);
  };

  return {
    status, busy, blocked, failed, activity, scope, staged, hasChanges, canPush,
    error: error || (state?.status === "error" ? state.message ?? "" : ""),
    run, manage, dismissError,
  };
}

export type GitActions = ReturnType<typeof useGitActions>;
