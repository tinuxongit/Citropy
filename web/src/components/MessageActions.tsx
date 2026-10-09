import { useId, useState } from "react";
import { AnimatePresence } from "motion/react";
import { BranchIcon } from "./icons/git.tsx";
import { RotateCcwIcon } from "./icons/rotation.tsx";
import { FileDiffIcon } from "./icons/files.tsx";
import { ConversationsIcon } from "./ConversationsIcon.tsx";
import { LayersIcon } from "./LayersIcon.tsx";
import { CopyIcon } from "./icons/actions.tsx";
import { CheckIcon } from "./icons/marks.tsx";
import { api, reportError } from "../lib/api.ts";
import { selectThread, useApp } from "../lib/store.ts";
import { useCopied } from "../lib/use-copied.ts";
import { sendToComposer } from "../lib/composer-inbox.ts";
import { Modal } from "./Modal.tsx";
import { TaskReview } from "./TaskReview.tsx";
import { fileRestoreIssue } from "../../../shared/review.ts";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { ActionError } from "./ActionError.tsx";

function answerText(messageIds: string[], user: boolean): string {
  const { messages, parts } = useApp.getState();
  const content = messageIds.flatMap(id => messages[id]!.partIds).map(id => parts.get(id)!).filter(part => part.kind !== "notice");
  const answer = user ? content : content.slice(content.findLastIndex(part => part.kind !== "text") + 1);
  return answer.flatMap(part => part.kind === "text" && part.text.trim() ? [part.text.trim()] : []).join("\n\n");
}

export function MessageActions({ threadId, messageId, replyIds = [messageId], user }: { threadId: string; messageId: string; replyIds?: string[]; user: boolean }) {
  const [dialog, setDialog] = useState<"restore" | "review">();
  const checkpoints = useApp(state => state.threads[threadId]?.checkpoints);
  const running = useApp(state => Boolean(state.threads[threadId]?.running));
  const compacting = useApp(state => Boolean(state.threads[threadId]?.compacting));
  const nativeAgent = useApp(state => Boolean(state.threads[threadId]?.nativeAgentId));
  const reviewThread = useApp(state => dialog === "review" ? state.threads[threadId] : undefined);
  const [mode, setMode] = useState<"conversation" | "files" | "both">("conversation");
  const id = useId();
  const connected = useApp(state => state.connected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checkpoint = checkpoints?.find(entry => entry.messageId === messageId);
  const fileIssue = fileRestoreIssue(checkpoints, messageId);
  const unavailable = fileIssue === "missing"
    ? "No file checkpoint was saved for this message."
    : fileIssue === "incomplete"
      ? "No completed file checkpoint is available for this task yet."
      : fileIssue === "shared"
        ? "Another task worked in this folder. Only conversation history can be restored."
        : undefined;
  const restoreDisabled = busy || running || compacting || !connected || (mode !== "conversation" && Boolean(fileIssue));
  const choices = [
    { value: "conversation", label: "Conversation only", description: "Rewind the chat and start a new provider session.", icon: ConversationsIcon },
    { value: "files", label: "Files only", description: "Restore file changes since this message. Keep the chat.", icon: FileDiffIcon },
    { value: "both", label: "Files and conversation", description: "Restore file changes and rewind the chat together.", icon: LayersIcon },
  ] as const;
  const restore = async () => {
    if (restoreDisabled) return;
    setBusy(true); setError("");
    const resend = { text: answerText([messageId], true), attachments: useApp.getState().messages[messageId]!.attachments ?? [], placement: "before" as const };
    try {
      await api(`threads/restore?threadId=${threadId}`, { method: "POST", body: JSON.stringify({ messageId, mode }) });
      if (mode !== "files") sendToComposer(threadId, resend);
      setDialog(undefined);
    }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const [copied, copy] = useCopied();
  const fork = async () => {
    setBusy(true);
    try {
      const next = await api<ThreadMeta>(`threads/fork?threadId=${threadId}`, { method: "POST", body: JSON.stringify({ messageId }) });
      useApp.setState(state => ({ threads: { ...state.threads, [next.id]: next } }));
      selectThread(next.id);
    } catch (error) { reportError(error); } finally { setBusy(false); }
  };
  return <><span className="message-actions">
    <button className="icon-btn" type="button" aria-label={copied ? "Copied" : "Copy message"} title={copied ? "Copied" : "Copy message"} onClick={() => copy(answerText(replyIds, user))}>{copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}</button>
    {!nativeAgent && <button className="icon-btn" type="button" aria-label="Branch from this message" title="Branch from this message" disabled={busy} onClick={() => void fork()}><BranchIcon size={13} /></button>}
    {user && !nativeAgent && <button className="icon-btn" type="button" aria-label="Restore before this message" title="Restore before this message" disabled={busy || running} onClick={() => { setMode("conversation"); setDialog("restore"); setError(""); }}><RotateCcwIcon size={13} /></button>}
    {checkpoint?.before && !nativeAgent && <button className="icon-btn" type="button" aria-label="Review this turn" title="Review this turn" onClick={() => setDialog("review")}><FileDiffIcon size={13} /></button>}
  </span>
    <AnimatePresence>
      {reviewThread && <TaskReview thread={reviewThread} messageId={messageId} onClose={() => setDialog(undefined)} />}
      {dialog === "restore" && <Modal
        title="Restore before this message"
        className="restore-dialog"
        busy={busy}
        onClose={() => setDialog(undefined)}
        onSubmit={() => void restore()}
        description="Return to the point before this message."
        footer={<>
          <button className="btn" type="button" data-cancel disabled={busy} onClick={() => setDialog(undefined)}>Cancel</button>
          <button className="btn" data-variant="primary" disabled={restoreDisabled}>{busy ? "Restoring…" : "Restore"}</button>
        </>}
      >
        <fieldset className="restore-options" aria-label="What to restore" disabled={busy}>
          {choices.map(({ value, label, description, icon: Icon }) => {
            const disabled = value !== "conversation" && Boolean(fileIssue);
            return <label className="restore-choice" data-disabled={busy || disabled} key={value}>
              <Icon size={18} aria-hidden="true" />
              <span className="restore-choice-text">
                <strong id={`${id}-${value}-label`}>{label}</strong>
                <small id={`${id}-${value}-description`}>{description}</small>
              </span>
              <input
                type="radio"
                name={`${id}-mode`}
                value={value}
                checked={mode === value}
                disabled={disabled}
                onChange={() => setMode(value)}
                aria-labelledby={`${id}-${value}-label`}
                aria-describedby={disabled ? `${id}-unavailable` : `${id}-${value}-description`}
              />
            </label>;
          })}
        </fieldset>
        {unavailable && <p className="restore-unavailable" id={`${id}-unavailable`} role="status">{unavailable}</p>}
        <p className="restore-note">Running commands and external services are not undone. Redo is available until your next message.</p>
        <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
      </Modal>}
    </AnimatePresence>
  </>;
}
