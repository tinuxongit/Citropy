import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { routineStatus, scheduleText } from "../../lib/routines.ts";
import { useApp } from "../../lib/store.ts";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { RoutineDialog } from "./RoutineDialog.tsx";

const NO_ROUTINES: never[] = [];

export function RoutineSection({ threadId, emptyText }: { threadId: string; emptyText: string }) {
  const routines = useApp((state) => state.threads[threadId]?.routines ?? NO_ROUTINES);
  const [editing, setEditing] = useState<{ id?: string }>();
  return (
    <section className="bot-routines" aria-label="Routines">
      <div className="bot-section-head">
        <h3 className="bot-section-title">Routines</h3>
        {routines.length > 0 && (
          <button type="button" className="icon-btn" aria-label="Create routine" title="Create routine" onClick={() => setEditing({})}>
            <PlusIcon size={14} />
          </button>
        )}
      </div>
      {routines.length ? (
        <div className="bot-routine-list">
          {routines.map((routine) => (
            <button type="button" key={routine.id} className="bot-routine-row" data-paused={routine.paused || undefined} onClick={() => setEditing({ id: routine.id })}>
              <span className="bot-routine-text">
                <strong className="truncate">{routine.name}</strong>
                <small className="truncate">{[scheduleText(routine.schedule), routineStatus(routine)].filter(Boolean).join(" · ")}</small>
              </span>
              {routine.runs[0] && <span className="bot-run-dot" data-status={routine.runs[0].status} aria-label={`Last run ${routine.runs[0].status}`} />}
              <ChevronRightIcon size={12} />
            </button>
          ))}
        </div>
      ) : (
        <div className="bot-routines-empty">
          <p>{emptyText}</p>
          <button type="button" className="btn" onClick={() => setEditing({})}>Create routine</button>
        </div>
      )}
      <AnimatePresence>{editing && <RoutineDialog threadId={threadId} id={editing.id} onClose={() => setEditing(undefined)} />}</AnimatePresence>
    </section>
  );
}
