import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, CircleCheck, CircleDot, CircleX, ExternalLink, FileDiff, GitBranch, GitCommitHorizontal, GitPullRequest, Globe, Rows3 } from "lucide-react";
import { DetailRow, DetailSplitRow } from "./DetailRow.tsx";
import type { GitActions } from "./use-git-actions.ts";
import type { MenuItem } from "../Menu.tsx";
import { PixelLoader } from "../PixelLoader.tsx";
import { LineCounts } from "../LineCounts.tsx";
import { manageGit, openWorkbenchPanel } from "../../lib/actions.ts";
import { useGitHub } from "../../lib/use-github.ts";
import type { GitHubBranchPull } from "../../../../shared/github.ts";
import type { ThreadMeta } from "../../../../shared/protocol.ts";
import { ActionError } from "../ActionError.tsx";

const checkLabels: Record<GitHubBranchPull["checks"], string> = {
  passing: "Checks passing",
  failing: "Checks failing",
  pending: "Checks running",
  none: "No checks",
};

const checkIcons = { passing: CircleCheck, failing: CircleX, pending: CircleDot, none: CircleDot };

interface Props {
  thread: ThreadMeta;
  git: GitActions;
  branch: string;
  onReview: () => void;
  onSourceControl: () => void;
  onChanges: () => void;
}

export function GitSection({ thread, git, branch, onReview, onSourceControl, onChanges }: Props) {
  const { status, blocked, hasChanges } = git;
  const [branches, setBranches] = useState<string[]>();
  const loadBranches = () => void manageGit(thread.projectId, "overview", undefined, undefined, undefined, thread.id).then((result) => {
    if (typeof result === "object" && "branches" in result) setBranches(result.branches.filter((entry) => !entry.remote).map((entry) => entry.name));
  });
  const branchMenu: MenuItem[] = branches
    ? branches.map((name) => ({ id: name, label: name, selected: name === branch, disabled: blocked || name === branch, onSelect: () => void git.manage("switchBranch", name) }))
    : [{ id: "loading", label: "Loading branches…", disabled: true }];
  const added = status?.files.reduce((total, file) => total + file.added, 0) ?? 0;
  const removed = status?.files.reduce((total, file) => total + file.removed, 0) ?? 0;
  return <>
    <DetailSplitRow icon={<GitBranch size={16} />} label={branch} title={`Current branch ${branch}`} onClick={onSourceControl} menu={branchMenu} menuLabel="Switch branch" onMenuOpen={loadBranches} />
    <PullRequestRow key={branch} thread={thread} />
    <GitActionRow git={git} onReview={onReview} onSourceControl={onSourceControl} />
    <ActionError className="details-error" message={git.failed ? git.error : ""} onDismiss={git.dismissError} />
    <DetailRow icon={<FileDiff size={16} />} label="Changes" disabled={!status} onClick={onChanges}
      hint={!status ? "Loading…" : added || removed ? <LineCounts added={added} removed={removed} /> : hasChanges ? `${status.files.length} files` : "Clean"} />
  </>;
}

function PullRequestRow({ thread }: { thread: ThreadMeta }) {
  const github = useGitHub("status", { projectId: thread.projectId });
  const ready = Boolean(github.data?.account && github.data.repositories.length);
  const lookup = useGitHub("branchPull", ready ? { projectId: thread.projectId, threadId: thread.id } : null);
  const pull = lookup.data?.pull;
  if (lookup.error) return <DetailRow icon={<GitPullRequest size={16} />} label="Pull request unavailable" title={lookup.error} />;
  if (!pull) return null;
  const Checks = checkIcons[pull.checks];
  return <DetailSplitRow icon={<GitPullRequest size={16} />} label={`#${pull.number}: ${pull.title}`} title={`${pull.title} (${pull.state.toLowerCase()})`}
    onClick={() => openWorkbenchPanel("browser", pull.url)}
    extra={pull.checks !== "none" && <span className="details-checks" data-checks={pull.checks} title={checkLabels[pull.checks]} aria-label={checkLabels[pull.checks]}><Checks size={14} /></span>}
    menuLabel="Pull request actions"
    menu={[
      { id: "browser", label: "Open in browser panel", icon: <Globe size={14} />, onSelect: () => openWorkbenchPanel("browser", pull.url) },
      { id: "external", label: "Open on GitHub", icon: <ExternalLink size={14} />, onSelect: () => window.open(pull.url, "_blank", "noopener") },
    ]} />;
}

function GitActionRow({ git, onReview, onSourceControl }: { git: GitActions; onReview: () => void; onSourceControl: () => void }) {
  const { status, blocked, busy, failed, hasChanges, canPush } = git;
  const unpublished = status?.upstream === null;
  const behind = Boolean(status?.behind);
  const scopeHint = git.scope === "staged" ? `${git.staged} staged` : "All changes";
  const quick =
    hasChanges ? { label: "AI commit", icon: GitCommitHorizontal, hint: scopeHint, run: () => void git.run("commit") }
    : unpublished ? { label: "Publish branch", icon: ArrowUpFromLine, hint: undefined, run: onSourceControl }
    : behind ? { label: "Pull", icon: ArrowDownToLine, hint: `${status!.behind} behind`, run: () => void git.manage("pull") }
    : canPush ? { label: "Push", icon: ArrowUpFromLine, hint: `${status!.ahead} to push`, run: () => void git.run("push") }
    : { label: "Pull", icon: ArrowDownToLine, hint: undefined, run: () => void git.manage("pull") };
  const Icon = failed ? CircleAlert : quick.icon;
  return <div className="details-git-action" data-error={failed || undefined}>
    <DetailSplitRow
      icon={busy ? <PixelLoader size={14} /> : <Icon size={16} />}
      label={busy ? git.activity : quick.label}
      hint={busy ? undefined : quick.hint}
      disabled={blocked || !status}
      onClick={quick.run}
      menuLabel="More Git actions"
      menu={[
        { id: "commit", label: "AI commit", hint: scopeHint, icon: <GitCommitHorizontal size={14} />, disabled: blocked || !hasChanges, onSelect: () => void git.run("commit") },
        { id: "commitPush", label: "AI commit & push", icon: <ArrowUpFromLine size={14} />, disabled: blocked || !hasChanges || behind || unpublished, onSelect: () => void git.run("commitPush") },
        { id: "push", label: "Push", icon: <ArrowUpFromLine size={14} />, disabled: blocked || !canPush, onSelect: () => void git.run("push") },
        { id: "pull", label: "Pull", icon: <ArrowDownToLine size={14} />, disabled: blocked || unpublished, onSelect: () => void git.manage("pull") },
        { id: "review", label: "Review task changes", icon: <FileDiff size={14} />, section: "More", onSelect: onReview },
        { id: "source", label: "Open Source control", icon: <Rows3 size={14} />, section: "More", onSelect: onSourceControl },
      ]} />
  </div>;
}
