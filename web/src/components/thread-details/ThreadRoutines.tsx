import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { routineStatus, scheduleText } from "../../lib/routines.ts";
import { useApp } from "../../lib/store.ts";
import { ClockIcon } from "../icons/status.tsx";
import { RoutineDialog } from "../routines/RoutineDialog.tsx";
import { DetailRow } from "./DetailRow.tsx";

const NO_ROUTINES: never[] = [];

export function ThreadRoutines({ threadId }: { threadId: string }) {
  const routines = useApp((state) => state.threads[threadId]?.routines ?? NO_ROUTINES);
  const [editing, setEditing] = useState<{ id?: string }>();
  return <>
    {routines.map((routine) => (
      <DetailRow key={routine.id} icon={<ClockIcon size={16} />} label={routine.name} hint={routineStatus(routine)} title={scheduleText(routine.schedule)} onClick={() => setEditing({ id: routine.id })} />
    ))}
    <DetailRow icon={<ClockIcon size={16} />} label="Add routine" title="Send this conversation a task on a schedule" onClick={() => setEditing({})} />
    <AnimatePresence>{editing && <RoutineDialog threadId={threadId} id={editing.id} onClose={() => setEditing(undefined)} />}</AnimatePresence>
  </>;
}
