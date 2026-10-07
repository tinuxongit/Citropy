import { Prose } from "./Prose.tsx";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../../lib/store.ts";
import { useDisclosure } from "../../lib/use-disclosure.ts";
import { Collapsible } from "../Collapsible.tsx";
import { Brain, ChevronRight } from "../icons.ts";
import type { ReasoningPart } from "../../../../shared/protocol.ts";

interface Props {
  ids: string[];
  live: boolean;
}

export function Reasoning({ ids, live }: Props) {
  const [open, setOpen] = useDisclosure(ids[0], "reasoning");
  const parts = useApp(useShallow(state => ids.map(id => state.parts.get(id)).filter((part): part is ReasoningPart => part?.kind === "reasoning" && Boolean(part.text.trim()))));
  if (!parts.length) return null;
  const thinking = live && parts.some(part => part.complete !== true);
  return <div className="reasoning" data-open={open || undefined}>
    <button className="reasoning-head" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Brain size={12} aria-hidden="true" />
      <span>{thinking ? "Thinking" : "Thought"}</span>
      <ChevronRight size={12} className="group-chevron" aria-hidden="true" />
    </button>
    <Collapsible open={open} className="reasoning-collapse">
      <div className="reasoning-body">
        {parts.map(part => <Prose key={part.id} partId={part.id} text={part.text} live={live && part.complete !== true} />)}
      </div>
    </Collapsible>
  </div>;
}
