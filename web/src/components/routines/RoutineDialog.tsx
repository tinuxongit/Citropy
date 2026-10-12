import { useState } from "react";
import { ROUTINE_LIMITS, type Routine, type RoutineDraft } from "../../../../shared/routines.ts";
import { reportError } from "../../lib/api.ts";
import { clock, day } from "../../lib/format.ts";
import { removeRoutine, runRoutine, saveRoutine } from "../../lib/routines.ts";
import { useApp } from "../../lib/store.ts";
import { TrashIcon } from "../icons/actions.tsx";
import { ClockIcon } from "../icons/status.tsx";
import { Modal } from "../Modal.tsx";
import { ScheduleFields, newSchedule } from "./ScheduleFields.tsx";

const NEW_ROUTINE: RoutineDraft = { name: "", prompt: "", schedule: newSchedule("daily"), paused: false };
const RUN_LABELS: Record<Routine["runs"][number]["status"], string> = { running: "Running", ok: "Finished", error: "Failed", stopped: "Stopped" };

export function RoutineDialog({ threadId, id, onClose }: { threadId: string; id?: string; onClose: () => void }) {
  const routine = useApp((state) => id ? state.threads[threadId]?.routines?.find((entry) => entry.id === id) : undefined);
  const [draft, setDraft] = useState<RoutineDraft>(routine ? { id: routine.id, name: routine.name, prompt: routine.prompt, schedule: routine.schedule, paused: routine.paused } : NEW_ROUTINE);
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    void saveRoutine(threadId, draft)
      .then(onClose)
      .catch(reportError)
      .finally(() => setSaving(false));
  };
  return (
    <Modal className="routine-dialog" title={routine ? "Edit routine" : "New routine"} description="Sends this conversation a task on a schedule." icon={<ClockIcon size={18} />} initialFocus="input" busy={saving} onClose={onClose} onSubmit={save}
      footer={<>
        {routine && <button type="button" className="btn dialog-footer-start" data-variant="danger" onClick={() => void removeRoutine(threadId, routine).then((removed) => removed && onClose())}><TrashIcon size={14} />Delete</button>}
        {routine && <button type="button" className="btn" onClick={() => runRoutine(threadId, routine.id)}>Test run</button>}
        <button type="button" className="btn" data-cancel onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={saving}>Save</button>
      </>}>
      <div className="routine-form">
        <section className="settings-group routine-card" aria-label="Task">
          <label className="feature-field">
            Name
            <input required maxLength={ROUTINE_LIMITS.nameLength} placeholder="Morning briefing" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="feature-field">
            Instructions
            <textarea required rows={4} maxLength={ROUTINE_LIMITS.promptLength} placeholder="What should happen each time this runs?" value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} />
          </label>
        </section>
        <section className="settings-group routine-card">
          <ScheduleFields schedule={draft.schedule} saved={routine?.schedule} paused={draft.paused} onChange={(schedule) => setDraft({ ...draft, schedule })} />
          {routine && (
            <label className="bot-notify">
              <span>
                <strong>Paused</strong>
                <small>Paused routines keep their settings but don't run</small>
              </span>
              <input className="setting-switch" type="checkbox" role="switch" checked={draft.paused} onChange={(event) => setDraft({ ...draft, paused: event.target.checked })} />
            </label>
          )}
        </section>
        {routine && routine.runs.length > 0 && (
          <section className="settings-group routine-card routine-runs" aria-label="Recent runs">
            <h3 className="bot-section-title">Recent runs</h3>
            {routine.runs.map((run) => (
              <div key={run.id} className="routine-run">
                <span className="bot-run-dot" data-status={run.status} />
                <span className="routine-run-text">
                  <span>{RUN_LABELS[run.status]}{run.test ? " · Test" : ""}</span>
                  <time>{day(run.startedAt)} {clock(run.startedAt)}</time>
                  {run.error && <small className="routine-run-error">{run.error}</small>}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </Modal>
  );
}
