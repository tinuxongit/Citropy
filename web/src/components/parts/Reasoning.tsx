import { Prose } from "./Prose.tsx";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../../lib/store.ts";
import { useDisclosure } from "../../lib/use-disclosure.ts";
import { Collapsible } from "../Collapsible.tsx";
import { BrainIcon } from "../icons/objects.tsx";
import { ChevronRightIcon } from "../icons/chevrons.tsx";
import type { ReasoningPart } from "../../../../shared/protocol.ts";

interface Props {
  ids: string[];
  live: boolean;
}

export function Reasoning({ ids, live }: Props) {
  const parts = useApp(useShallow(state => ids.map(id => state.parts.get(id)).filter((part): part is ReasoningPart => part?.kind === "reasoning" && Boolean(part.text.trim()))));
  const thinking = live && parts.some(part => part.complete !== true);
  const [open, setOpen] = useDisclosure(ids[0], "reasoning", thinking);
  if (!parts.length) return null;
  return <div className="reasoning" data-open={open || undefined}>
    <button className="reasoning-head" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <BrainIcon size={12} aria-hidden="true" />
      <span>{thinking ? "Thinking" : "Thought"}</span>
      <ChevronRightIcon size={12} className="group-chevron" aria-hidden="true" />
    </button>
    <Collapsible open={open} className="reasoning-collapse">
      <div className="reasoning-body">
        {parts.map(part => <Prose key={part.id} partId={part.id} text={part.text} live={live && part.complete !== true} />)}
      </div>
    </Collapsible>
  </div>;
}
