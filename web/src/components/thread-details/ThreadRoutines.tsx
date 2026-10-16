import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { routineStatus, scheduleText } from "../../lib/routines.ts";
import { useApp } from "../../lib/store.ts";
import { ClockIcon } from "../icons/status.tsx";
import { RefreshIcon } from "../icons/rotation.tsx";
import { RoutineDialog } from "../routines/RoutineDialog.tsx";
import { DetailRow, DetailSection } from "./DetailRow.tsx";

const NO_ROUTINES: never[] = [];

export function ThreadRoutines({ threadId }: { threadId: string }) {
  const routines = useApp((state) => state.threads[threadId]?.routines ?? NO_ROUTINES);
  const [editing, setEditing] = useState<{ id?: string }>();
  return (
    <>
      <DetailSection
        icon={<RefreshIcon size={16} />}
        title="Routines"
        addLabel="Add routine"
        onAdd={() => setEditing({})}
      >
        {routines.map((routine) => {
          const last = routine.runs[0];
          const icon = (
            <span className="details-routine-icon">
              <ClockIcon size={14} />
              {last && (
                <span
                  className="bot-run-dot"
                  data-status={last.status}
                  aria-label={`Last run ${last.status}`}
                />
              )}
            </span>
          );
          return (
            <DetailRow
              key={routine.id}
              icon={icon}
              label={routine.name}
              hint={routineStatus(routine)}
              title={scheduleText(routine.schedule)}
              onClick={() => setEditing({ id: routine.id })}
            />
          );
        })}
      </DetailSection>
      <AnimatePresence>
        {editing && (
          <RoutineDialog
            threadId={threadId}
            id={editing.id}
            onClose={() => setEditing(undefined)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
