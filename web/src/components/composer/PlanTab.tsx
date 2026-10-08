import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence } from "motion/react";
import { PlanIcon } from "../PlanIcon.tsx";
import { send } from "../../lib/socket.ts";
import { normalizeTodos } from "../../../../shared/todos.ts";
import type { TodoItem } from "../../../../shared/protocol.ts";
import { useApp, type AppState } from "../../lib/store.ts";
import { TodoSteps } from "../parts/TodoBoard.tsx";
import { ComposerPopover } from "./ComposerPopover.tsx";
import { ComposerTab } from "./ComposerTab.tsx";

function useLatestPlan(threadId: string): TodoItem[] {
  const selectPlan = useMemo(() => {
    let previous: AppState | undefined;
    let latestId: string | undefined;
    return (state: AppState) => {
      const version = state.timelineVersions?.[threadId];
      if (!previous || previous.order[threadId] !== state.order[threadId] || previous.messages !== state.messages ||
        (previous.parts !== state.parts && (version === undefined || previous.timelineVersions?.[threadId] !== version))) {
        latestId = undefined;
        const ids = state.order[threadId] ?? [];
        for (let message = ids.length - 1; message >= 0 && latestId === undefined; message--) {
          const partIds = state.messages[ids[message]!]?.partIds ?? [];
          for (let part = partIds.length - 1; part >= 0; part--) {
            const id = partIds[part]!;
            if (state.parts.get(id)?.kind === "todo") {
              latestId = id;
              break;
            }
          }
        }
      }
      previous = state;
      const entry = latestId === undefined ? undefined : state.parts.get(latestId);
      return entry?.kind === "todo" ? entry.items : undefined;
    };
  }, [threadId]);
  const items = useApp(selectPlan);
  return normalizeTodos(items);
}

export function PlanTab({ threadId }: { threadId: string }) {
  const steps = useLatestPlan(threadId);
  const unfinished = steps.some((step) => step.status === "pending" || step.status === "in_progress");
  const done = steps.filter((step) => step.status === "completed").length;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { if (!unfinished) setOpen(false); }, [unfinished]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return <>
    <AnimatePresence>{unfinished && <ComposerTab key="plan" ref={trigger} title="Plan" aria-label={`Plan, ${done} of ${steps.length} done`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <PlanIcon size={13} /><span>{done}/{steps.length}</span>
    </ComposerTab>}</AnimatePresence>
    <AnimatePresence>{open && unfinished && <PlanPanel id={id} threadId={threadId} trigger={trigger} steps={steps} done={done} onClose={close} />}</AnimatePresence>
  </>;
}

function PlanPanel({ id, threadId, trigger, steps, done, onClose }: { id: string; threadId: string; trigger: RefObject<HTMLButtonElement | null>; steps: TodoItem[]; done: number; onClose: () => void }) {
  const connected = useApp((state) => state.connected);
  return <ComposerPopover id={id} label="Plan" className="plan-panel scroll" anchor={trigger} width={360} onClose={onClose}>
    <header className="plan-panel-heading"><PlanIcon size={15} aria-hidden="true" /><strong>Plan</strong><span>{done}/{steps.length}</span></header>
    <TodoSteps steps={steps} />
    <button type="button" className="btn plan-discard" disabled={!connected} title="Hide this plan and mark its open steps as cancelled" onClick={() => send({ t: "thread.discardPlan", id: threadId })}>Discard plan</button>
  </ComposerPopover>;
}
