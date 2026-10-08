import { CheckIcon, MinusIcon } from "../icons/marks.tsx";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { CircleDotIcon, CircleIcon } from "../icons/status.tsx";
import { PlanIcon } from "../PlanIcon.tsx";
import type { CSSProperties } from "react";
import type { TodoItem } from "../../../../shared/protocol.ts";
import { normalizeTodos } from "../../../../shared/todos.ts";
import { useDisclosure } from "../../lib/use-disclosure.ts";
import { Collapsible } from "../Collapsible.tsx";

export function TodoBoard({ partId, items }: { partId: string; items: TodoItem[] }) {
  const [open, setOpen] = useDisclosure(partId, "plan");
  const steps = normalizeTodos(items);
  if (steps.length === 0) return null;
  const done = steps.filter((item) => item.status === "completed").length;
  const current = steps.find(item => item.status === "in_progress") ?? steps.find(item => item.status === "pending");

  return (
    <section className="todo" aria-label="Plan">
      <button className="todo-head" type="button" aria-expanded={open} aria-controls={`plan-${partId}`} onClick={() => setOpen(!open)}>
        <ChevronRightIcon size={12} className="group-chevron" aria-hidden="true" />
        <PlanIcon size={14} aria-hidden="true" />
        <span>Plan</span>
        <span className="todo-progress">{done}/{steps.length}</span>
      </button>
      <Collapsible open={!open && Boolean(current)} className="todo-current-collapse">
        {current && <div className="todo-current"><CircleDotIcon size={14} aria-hidden="true" /><span>{current.text}</span></div>}
      </Collapsible>
      <Collapsible open={open} className="todo-list-collapse">
        <TodoSteps id={`plan-${partId}`} steps={steps} />
      </Collapsible>
    </section>
  );
}

export function TodoSteps({ id, steps }: { id?: string; steps: TodoItem[] }) {
  return (
    <ul id={id} className="todo-list">
      {steps.map((item, index) => {
        const Icon = item.status === "completed" ? CheckIcon : item.status === "in_progress" ? CircleDotIcon : item.status === "cancelled" ? MinusIcon : CircleIcon;
        const label = item.status === "completed" ? "Completed" : item.status === "in_progress" ? "In progress" : item.status === "cancelled" ? "Cancelled" : "Pending";
        return (
          <li key={`${index}-${item.text}`} className="todo-item" data-status={item.status} style={{ "--todo-step": Math.min(index, 10) } as CSSProperties}>
            <span key={item.status} className="todo-mark" role="img" aria-label={label} title={label}>
              <Icon size={14} aria-hidden="true" />
            </span>
            <span>{item.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
