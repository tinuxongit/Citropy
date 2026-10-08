import { AnimatePresence } from "motion/react";
import { useId, useState } from "react";
import { ForkIcon, PullRequestIcon } from "./icons/git.tsx";
import { ArchiveIcon, ArchiveRestoreIcon, PinIcon, PinOffIcon, TrashIcon } from "./icons/actions.tsx";
import { ClockIcon } from "./icons/status.tsx";
import { MoreIcon } from "./icons/marks.tsx";
import { EditIcon } from "./icons/pencil.tsx";
import { ArrowDownIcon, ArrowUpIcon } from "./icons/arrows.tsx";
import { RefreshIcon } from "./icons/rotation.tsx";
import { SquarePlusIcon } from "./icons/squares.tsx";
import { Menu, type MenuItem } from "./Menu.tsx";
import { Modal } from "./Modal.tsx";
import { SnoozeMenu } from "./SnoozeMenu.tsx";
import { api, reportError } from "../lib/api.ts";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { environmentSlice } from "../lib/live-environments.ts";
import { useApp, confirmAction, viewportWidth } from "../lib/store.ts";
import { environmentId } from "../lib/environment.ts";
import { openInNewTab } from "../lib/actions.ts";
import { ActionError } from "./ActionError.tsx";

export async function organizeConversation(id: string, patch: object, environment?: string) {
  await api(`threads/organize?threadId=${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }, environment);
}

export function ConversationMenu({
  thread,
  environment,
  onMove,
  rowActions = [],
}: {
  thread: ThreadMeta;
  environment?: string;
  onMove?: (direction: number) => void;
  rowActions?: MenuItem[];
}) {
  const projects = useApp(state => state.projects);
  const tabbable = useApp(state => (environment ?? environmentId()) === environmentId() && !state.openThreadIds.includes(thread.id));
  const project = (environment ? environmentSlice(environment)?.projects : projects)?.find(project => project.id === thread.projectId);
  const worktree = async (action: "copy" | "remove") => {
    if (!await confirmAction({ title: action === "copy" ? "Continue in a new worktree?" : "Remove this worktree?", description: action === "copy" ? "Copy the current changes to a new branch and continue this task there. Changes remain in the original folder. The copied changes start unstaged." : "Only a clean worktree unused by other tasks can be removed. The branch and conversation history stay available.", label: action === "copy" ? "Copy and continue" : "Remove worktree", danger: action === "remove" })) return;
    setBusy(true);
    try { await api(`threads/worktree?threadId=${thread.id}`, { method: "POST", body: JSON.stringify({ action }) }, environment); }
    catch (error) { reportError(error); }
    finally { setBusy(false); }
  };
  const [editing, setEditing] = useState<"title" | "pullRequest">();
  const [snoozeAnchor, setSnoozeAnchor] = useState<HTMLElement>();
  const menuId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const regenerateTitle = async () => {
    setGeneratingTitle(true);
    try { await api(`threads/title?threadId=${encodeURIComponent(thread.id)}`, { method: "POST" }, environment); }
    catch (error) { reportError(error); }
    finally { setGeneratingTitle(false); }
  };
  const edit = (field: typeof editing) => {
    setEditing(field);
    setValue(field === "title" ? thread.title : (thread.pullRequest ?? ""));
    setError("");
  };
  const update = (patch: object) =>
    organizeConversation(thread.id, patch, environment).catch(reportError);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (editing === "title")
        await organizeConversation(thread.id, { title: value.trim() }, environment);
      else
        await organizeConversation(thread.id, { pullRequest: value.trim() }, environment);
      setEditing(undefined);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Menu
        align="end"
        width={230}
        span=".thread-card"
        sheet={viewportWidth() <= 600}
        triggerId={menuId}
        items={[
          ...(tabbable ? [{ id: "open-tab", label: "Open in new tab", icon: <SquarePlusIcon size={15} />, onSelect: () => openInNewTab(thread.id) }] : []),
          ...(project?.isGit ? [{ id: "worktree", label: "Continue in new worktree…", icon: <ForkIcon size={15} />, disabled: thread.running || busy, onSelect: () => { void worktree("copy"); } }] : []),
          ...(thread.archived && thread.workspacePath && thread.workspacePath !== project?.path ? [{ id: "remove-worktree", label: "Remove worktree…", icon: <TrashIcon size={15} />, danger: true, disabled: busy, onSelect: () => { void worktree("remove"); } }] : []),
          ...(thread.canRedo ? [{ id: "redo", label: "Redo restored turn", icon: <RefreshIcon size={15} />, disabled: thread.running, onSelect: () => { void api(`threads/restore?threadId=${thread.id}`, { method: "POST", body: JSON.stringify({ redo: true }) }, environment).catch(reportError); } }] : []),
          {
            id: "pin",
            label: thread.pinned ? "Unpin conversation" : "Pin conversation",
            icon: thread.pinned ? <PinOffIcon size={15} /> : <PinIcon size={15} />,
            onSelect: () => update({ pinned: !thread.pinned }),
          },
          {
            id: "rename",
            label: "Rename…",
            icon: <EditIcon size={15} />,
            onSelect: () => edit("title"),
          },
          ...(!thread.parentThreadId ? [{
            id: "generate-title",
            label: generatingTitle ? "Naming conversation…" : "Generate title",
            icon: <RefreshIcon size={15} />,
            disabled: generatingTitle,
            onSelect: () => void regenerateTitle(),
          }] : []),
          ...(onMove ? [
            {
              id: "up",
              label: "Move up",
              icon: <ArrowUpIcon size={15} />,
              onSelect: () => onMove(-1),
            },
            {
              id: "down",
              label: "Move down",
              icon: <ArrowDownIcon size={15} />,
              onSelect: () => onMove(1),
            },
          ] : []),
          {
            id: "pr",
            label: thread.pullRequest
              ? "Edit pull request link…"
              : "Link pull request…",
            icon: <PullRequestIcon size={15} />,
            onSelect: () => edit("pullRequest"),
          },
          ...(!thread.running
            ? [
                {
                  id: "snooze",
                  label: thread.snoozedUntil
                    ? "Wake conversation"
                    : "Snooze…",
                  icon: <ClockIcon size={15} />,
                  onSelect: () =>
                    thread.snoozedUntil
                      ? update({ snoozedUntil: null })
                      : setSnoozeAnchor(document.getElementById(menuId) ?? undefined),
                },
                {
                  id: "archive",
                  label: thread.archived
                    ? "Restore conversation"
                    : "Archive conversation",
                  icon: thread.archived ? (
                    <ArchiveRestoreIcon size={15} />
                  ) : (
                    <ArchiveIcon size={15} />
                  ),
                  onSelect: () => update({ archived: !thread.archived }),
                },
              ]
            : []),
          ...rowActions,
        ]}
        trigger={({ id, open, toggle }) => (
          <button
            id={id}
            className="thread-more"
            type="button"
            aria-label={`Organize ${thread.title}`}
            aria-haspopup="menu"
            aria-expanded={open || Boolean(snoozeAnchor)}
            onClick={toggle}
          >
            <MoreIcon size={16} />
          </button>
        )}
      />
      <AnimatePresence>{editing && (
        <Modal
          title={editing === "title" ? "Rename conversation" : "Link a pull request"}
          onClose={() => setEditing(undefined)}
          onSubmit={save}
          busy={busy}
          initialFocus="input"
          footer={
            <>
              <button
                className="btn"
                data-cancel
                type="button"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button
                className="btn"
                data-variant="primary"
                disabled={busy || (editing !== "pullRequest" && !value.trim())}
              >
                Save
              </button>
            </>
          }
        >
          <label className="feature-field">
            {editing === "title" ? "Name" : "GitHub pull request URL"}
            <input
              type="text"
              value={value}
              maxLength={editing === "title" ? 200 : 2000}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                editing === "pullRequest"
                  ? "https://github.com/owner/repo/pull/123"
                  : undefined
              }
            />
          </label>
          <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
        </Modal>
      )}</AnimatePresence>
      {snoozeAnchor && <SnoozeMenu thread={thread} environment={environment} anchor={snoozeAnchor} onClose={() => setSnoozeAnchor(undefined)} />}
    </>
  );
}
