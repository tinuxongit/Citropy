import type { Project, ThreadMeta } from "../../../../shared/protocol.ts";
import { closeProject, confirmRemoveProjects, finishThread, removeThreads } from "../../lib/actions.ts";
import { reportError } from "../../lib/api.ts";
import { environmentSlice } from "../../lib/live-environments.ts";
import { organizeConversation } from "../ConversationMenu.tsx";
import { ArchiveIcon, TrashIcon } from "../icons/actions.tsx";
import { CheckIcon, CloseIcon } from "../icons/marks.tsx";
import { RotateCcwIcon } from "../icons/rotation.tsx";

export interface PickedThread {
  thread: ThreadMeta;
  environment: string;
  blocked: boolean;
}

export interface PickedProject {
  project: Project;
  environment: string;
}

export function PickedActions({ threads, projects, onFinished, onClear }: {
  threads: PickedThread[];
  projects: PickedProject[];
  onFinished: () => void;
  onClear: () => void;
}) {
  const live = threads.filter((item) => environmentSlice(item.environment)?.connected);
  const reopen = live.length > 0 && live.every((item) => item.thread.finished);
  const finishable = live.filter((item) => !item.blocked && Boolean(item.thread.finished) === reopen);
  const archivable = live.filter((item) => !item.thread.running && !item.thread.archived);

  const finish = () => {
    for (const item of finishable) finishThread(item.thread.id, !reopen, item.environment);
    if (!reopen) onFinished();
    onClear();
  };
  const archive = () => {
    void Promise.all(archivable.map((item) => organizeConversation(item.thread.id, { archived: true }, item.environment))).catch(reportError);
    onClear();
  };
  const remove = async () => {
    if (await removeThreads(live.map((item) => ({ id: item.thread.id, environment: item.environment })))) onClear();
  };
  const removeProjects = async () => {
    if (!await confirmRemoveProjects(projects.map((item) => item.project.name))) return;
    onClear();
    await Promise.all(projects.map((item) => closeProject(item.project.id, item.environment))).catch(reportError);
  };

  return (
    <div className="picked-actions" role="toolbar" aria-label="Selected items">
      <div className="picked-actions-header">
        <span>{threads.length + projects.length} selected</span>
        <button className="icon-btn" type="button" aria-label="Clear selection" title="Clear selection" onClick={onClear}><CloseIcon size={14} /></button>
      </div>
      <div className="picked-actions-buttons">
        {threads.length > 0 && <>
          <button className="btn" data-variant="ghost" type="button" disabled={!finishable.length} onClick={finish}>
            {reopen ? <RotateCcwIcon size={14} /> : <CheckIcon size={15} />}
            {reopen ? "Reopen" : "Finish"}
          </button>
          <button className="btn" data-variant="ghost" type="button" disabled={!archivable.length} onClick={archive}>
            <ArchiveIcon size={14} />
            Archive
          </button>
          <button className="btn" data-variant="danger" type="button" disabled={!live.length} onClick={() => void remove()}>
            <TrashIcon size={13} />
            Delete
          </button>
        </>}
        {projects.length > 0 && <button className="btn" data-variant="danger" type="button" onClick={() => void removeProjects()}>
          <TrashIcon size={13} />
          {projects.length === 1 ? "Remove project" : "Remove projects"}
        </button>}
      </div>
    </div>
  );
}
