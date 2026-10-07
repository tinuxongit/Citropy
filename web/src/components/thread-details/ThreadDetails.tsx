import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { CircleAlert, FolderOpen, GitBranchPlus, SquareMenu, SquarePen } from "lucide-react";
import { selectThread, toggleInspector, toggleThreadDetails, useApp } from "../../lib/store.ts";
import { send } from "../../lib/socket.ts";
import { openWorkbenchPanel } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import { isRemote } from "../../lib/environment.ts";
import { gitActionBusy } from "../../../../shared/assistance.ts";
import type { Project, ThreadMeta } from "../../../../shared/protocol.ts";
import { PixelLoader } from "../PixelLoader.tsx";
import { ActionError } from "../ActionError.tsx";
import { TaskReview } from "../TaskReview.tsx";
import { DetailRow } from "./DetailRow.tsx";
import { ProjectScripts } from "./ProjectScripts.tsx";
import { GitSection } from "./GitSection.tsx";
import { ShellsSection } from "./ShellsSection.tsx";
import { useGitActions } from "./use-git-actions.ts";
import { useVisibleInterval } from "../../lib/use-visible-interval.ts";
import { usePresent } from "../../lib/use-present.ts";
import { useLaggedValue } from "../../lib/use-lagged-value.ts";

const SETTINGS = { refreshMs: 5000 };

function useRootThread() {
  return useApp((state) => {
    let selected = state.activeThreadId ? state.threads[state.activeThreadId] : undefined;
    const visited = new Set<string>();
    while (selected?.parentThreadId && !visited.has(selected.id)) {
      visited.add(selected.id);
      selected = state.threads[selected.parentThreadId];
    }
    return selected?.parentThreadId ? undefined : selected;
  });
}

function useDetailsShown() {
  return useApp((state) => state.threadDetailsOpen && !state.inspectorOpen);
}

function toggleDetails() {
  const { inspectorOpen, threadDetailsOpen } = useApp.getState();
  if (inspectorOpen) toggleInspector();
  if (!inspectorOpen || !threadDetailsOpen) toggleThreadDetails();
}

export function ThreadDetailsButton() {
  const thread = useRootThread();
  const open = useDetailsShown();
  if (!thread) return null;
  const busy = gitActionBusy(thread.gitAction);
  const failed = thread.gitAction?.status === "error";
  return <button type="button" className="icon-btn thread-details-toggle" aria-label="Conversation details" aria-pressed={open} data-active={open} data-error={failed || undefined} title="Conversation details" onClick={toggleDetails}>
    {busy ? <PixelLoader size={15} /> : failed ? <CircleAlert size={16} /> : <SquareMenu size={16} />}
  </button>;
}

export function ThreadDetailsPanel() {
  const thread = useRootThread();
  const project = useApp((state) => state.projects.find((project) => project.id === thread?.projectId));
  const open = useDetailsShown() && Boolean(thread && project);
  const shown = useLaggedValue(open);
  const panel = useRef<HTMLElement>(null);
  const present = usePresent(shown, panel);
  if (!(open || present) || !thread || !project) return null;
  return <aside ref={panel} className="thread-details-panel" data-open={shown} inert={!open} aria-label="Conversation details">
    <ThreadDetails key={thread.id} thread={thread} project={project} />
  </aside>;
}

function ThreadDetails({ thread, project }: { thread: ThreadMeta; project: Project }) {
  const connected = useApp((state) => state.connected);
  const [reviewing, setReviewing] = useState(false);
  const git = useGitActions(thread);
  const isGit = Boolean(project.isGit);

  const refresh = useCallback(() => {
    send({ t: "git.refresh", projectId: thread.projectId, threadId: thread.id });
  }, [thread.projectId, thread.id]);
  const showInChat = (show: () => void) => {
    selectThread(thread.id);
    show();
  };
  const openSourceControl = () => {
    selectThread(thread.id);
    useApp.setState({ activeView: "git", readingThreadId: null });
  };

  const watching = connected && isGit && !git.busy;
  useEffect(() => { if (watching) refresh(); }, [watching, refresh]);
  useVisibleInterval(refresh, SETTINGS.refreshMs, watching);

  const folder = thread.workspacePath ?? project.path;
  const openFolder = !isRemote() && window.citropyDesktop?.openFolder;
  const branch = git.status?.branch || thread.workspaceBranch || project.branch || "Branch";
  return <>
    <section className="details-card">
      <div className="details-section" aria-label="Workspace">
        <DetailRow icon={<SquarePen size={16} />} label="Open in editor" disabled={!connected} onClick={() => showInChat(() => openWorkbenchPanel("files"))} />
        {openFolder && <DetailRow icon={<FolderOpen size={16} />} label="Open folder" title={folder} onClick={() => void openFolder(folder).catch(reportError)} />}
        <ProjectScripts project={project} threadId={thread.id} disabled={!connected} />
      </div>
      {isGit && <div className="details-section" aria-label="Version control">
        <GitSection thread={thread} git={git} branch={branch} onReview={() => setReviewing(true)} onSourceControl={openSourceControl} onChanges={() => showInChat(() => openWorkbenchPanel("changes"))} />
      </div>}
      {!isGit && <div className="details-section" aria-label="Version control">
        <DetailRow icon={git.busy ? <PixelLoader size={14} /> : <GitBranchPlus size={16} />} label={git.busy ? git.activity : "Initialize Git"} title="Start tracking this folder's history with Git" disabled={!connected || git.busy} onClick={() => void git.manage("init")} />
        <ActionError className="details-error" message={git.failed ? git.error : ""} onDismiss={git.dismissError} />
      </div>}
      <ShellsSection threadId={thread.id} disabled={!connected} />
      {!connected && <p className="details-note">Disconnected from Citropy</p>}
    </section>
    <AnimatePresence>{reviewing && <TaskReview thread={thread} onClose={() => setReviewing(false)} />}</AnimatePresence>
  </>;
}
