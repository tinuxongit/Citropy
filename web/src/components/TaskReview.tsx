import { useEffect, useRef, useState, type ComponentProps } from "react";
import { FileDiff, RefreshCw, ScanSearch, X } from "lucide-react";
import { Modal } from "./Modal.tsx";
import { DiffView } from "./DiffView.tsx";
import { FileIcon } from "./FileIcon.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { api } from "../lib/api.ts";
import { sendMessage, refreshGit } from "../lib/actions.ts";
import { confirmAction, selectThread, useApp } from "../lib/store.ts";
import { Select } from "./Select.tsx";
import type { FilePatch, ThreadMeta } from "../../../shared/protocol.ts";
import type { ChangeReviewSummary, ReviewScope } from "../../../shared/review.ts";
import type { AssistanceSettings, WritingModel } from "../../../shared/assistance.ts";
import { LineCounts } from "./LineCounts.tsx";
import { ActionError } from "./ActionError.tsx";

export function TaskReview({ thread, messageId, onClose }: { thread: ThreadMeta; messageId?: string; onClose: () => void }) {
  const [scope, setScope] = useState<ReviewScope>("lastTurn");
  const [loadedReview, setReview] = useState<{ params: string; revision: number; value: ChangeReviewSummary }>();
  const [revision, setRevision] = useState(0);
  const [limit, setLimit] = useState(30);
  const [open, setOpen] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const feedbackInput = useRef<HTMLTextAreaElement>(null);
  const [target, setTarget] = useState("");
  const [comments, setComments] = useState<string[]>([]);
  const [result, setResult] = useState<{ title: string; body: string; revision: string }>();
  const selection = useApp(state => state.assistance.reviewModel ?? null);
  const connected = useApp(state => state.connected);
  const active = useApp(state => state.threads[thread.id]?.running);
  const params = new URLSearchParams({ threadId: thread.id, scope, ...(messageId && scope === "lastTurn" ? { messageId } : {}) }).toString();
  const review = loadedReview?.params === params && loadedReview.revision === revision ? loadedReview.value : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReview(undefined);
    void api<ChangeReviewSummary>(`threads/review?${params}&summary=1`, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setReview({ params, revision, value });
      setOpen(new Set(value.files[0] ? [value.files[0].path] : []));
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params, revision]);
  const action = async (run: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await run(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const saveModel = async (reviewModel: WritingModel | null) => {
    const previous = useApp.getState().assistance.reviewModel;
    useApp.setState((state) => ({ assistance: { ...state.assistance, reviewModel } }));
    setError("");
    try {
      const assistance = await api<AssistanceSettings>("providers/assistance", { method: "PATCH", body: JSON.stringify({ reviewModel }) });
      useApp.setState({ assistance });
    } catch (error) {
      useApp.setState((state) => ({ assistance: { ...state.assistance, reviewModel: previous } }));
      setError((error as Error).message);
    }
  };
  const hunk = (path: string, index: number, operation: "stage" | "unstage" | "revert") => void action(async () => {
    if (operation === "revert" && !await confirmAction({ title: "Revert this hunk?", description: "Only this unstaged change will be discarded.", label: "Revert hunk", danger: true })) return;
    await api(`threads/hunk?threadId=${thread.id}`, { method: "POST", body: JSON.stringify({ scope, path, index, operation, revision: review?.revision }) });
    refreshGit(thread.projectId);
    setRevision(value => value + 1);
  });
  const addFeedback = () => { if (!feedback.trim()) return; setComments(previous => [...previous, `${target || "Review feedback"}: ${feedback.trim()}`]); setFeedback(""); setTarget(""); };
  const sendFeedback = () => void action(async () => {
    const entries = [...comments, ...(feedback.trim() ? [`${target || "Review feedback"}: ${feedback.trim()}`] : [])];
    selectThread(thread.id);
    await sendMessage(`Address this code review feedback. Recheck the current files before editing.\n\n${entries.join("\n\n")}`, []);
    onClose();
  });
  return <Modal title="Review changes" icon={<FileDiff size={18} />} className="task-review-dialog" onClose={onClose} busy={busy}
    footer={<><button className="btn" type="button" data-cancel onClick={onClose} disabled={busy}>Close</button><button className="btn" type="button" data-variant="primary" disabled={busy || !connected || (!comments.length && !feedback.trim())} onClick={sendFeedback}>{active ? "Queue feedback" : "Send feedback"}</button></>}>
    <div className="review-toolbar">
      <Select aria-label="Review scope" value={scope} disabled={busy} onChange={value => setScope(value as ReviewScope)} options={(["lastTurn", "task", "unstaged", "staged"] as const).map((value, index) => ({ value, label: ["Last turn", "Whole task", "Unstaged", "Staged"][index]! }))} />
      <button className="icon-btn" type="button" aria-label="Refresh review" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /></button>
      <ModelPicker label="Review model" value={selection} fallback={{ provider: thread.provider, providerInstanceId: thread.providerInstanceId, model: thread.model ?? "default" }} allowConversation disabled={busy} onChange={value => void saveModel(value)}
        tune={{ settings: { effort: selection?.effort }, only: ["effort"], onChange: patch => { if (selection) void saveModel({ ...selection, effort: patch.effort }); } }} />
      <button className="btn" type="button" disabled={busy || loading || !review?.files.length || !connected} onClick={() => void action(async () => { setResult(await api(`threads/review-model?threadId=${thread.id}`, { method: "POST", body: JSON.stringify({ scope, messageId: scope === "lastTurn" ? messageId : undefined }) })); })}><ScanSearch size={15} />{busy ? "Working…" : "AI review"}</button>
    </div>
    <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
    {loading && <p role="status">Loading changes…</p>}
    {review?.note && <p className="feature-note">{review.note}</p>}
    {result && <section className="review-result"><strong>{result.title}</strong><p>{result.body}</p>{result.revision !== review?.revision && <small>The files changed after this review. Run it again before relying on the findings.</small>}<button type="button" className="btn" onClick={() => setComments(previous => [...previous, `${result.title}\n${result.body}`])}>Add findings to feedback</button></section>}
    <div className="review-files">{review?.files.slice(0, limit).map(file => <section key={file.path} className="review-file"><button className="review-file-heading" type="button" aria-expanded={open.has(file.path)} onClick={() => setOpen(previous => { const next = new Set(previous); if (next.has(file.path)) next.delete(file.path); else next.add(file.path); return next; })}><FileIcon path={file.path} /><span className="truncate">{file.path}</span><LineCounts added={file.added} removed={file.removed} /></button>{open.has(file.path) && <ReviewPatch key={`${params}:${review.revision}:${file.path}`} params={params} path={file.path} revision={review.revision} staged={scope === "staged"} busy={busy || active} onComment={(line, side) => { setTarget(`${file.path}:${line} (${side})`); feedbackInput.current?.focus(); }} onHunk={scope === "staged" || scope === "unstaged" ? (index, operation) => hunk(file.path, index, operation) : undefined} />}</section>)}</div>
    {review && review.files.length > limit && <button className="btn" type="button" onClick={() => setLimit(value => value + 30)}>Show more files</button>}
    {!loading && review && !review.files.length && <p className="pane-empty">No changes in this scope.</p>}
    <div className="review-feedback"><label className="feature-field">{target || "Feedback for the agent"}<textarea ref={feedbackInput} maxLength={16000} value={feedback} rows={3} onChange={event => setFeedback(event.target.value)} placeholder="Select a line to attach a comment, or describe a change here." /></label><button className="btn" type="button" disabled={!feedback.trim()} onClick={addFeedback}>Add comment</button>{comments.map((comment, index) => <div className="review-comment" key={index}><span>{comment}</span><button className="icon-btn" type="button" aria-label="Remove comment" onClick={() => setComments(previous => previous.filter((_, position) => position !== index))}><X size={14} /></button></div>)}</div>
  </Modal>;
}

function ReviewPatch({ params, path, revision, ...props }: { params: string; path: string; revision: string } & Pick<ComponentProps<typeof DiffView>, "staged" | "busy" | "onComment" | "onHunk">) {
  const [patch, setPatch] = useState<FilePatch>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const file = new URLSearchParams({ path, revision });
    void api<FilePatch>(`threads/review?${params}&${file}`, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setPatch(value);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [params, path, revision]);
  if (error) return <p className="feature-error" role="alert">{error}</p>;
  if (!patch) return <p role="status">Loading changes…</p>;
  return <DiffView patch={patch} showHeader={false} expanded {...props} />;
}
