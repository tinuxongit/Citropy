import { useShallow } from "zustand/react/shallow";
import type { ToolPart } from "../../../shared/protocol.ts";
import { useApp } from "../lib/store.ts";
import { useDisclosure } from "../lib/use-disclosure.ts";
import { groupStats } from "../lib/group.ts";
import { duration } from "../lib/format.ts";
import type { FoldRow } from "../lib/timeline.ts";
import { AlertTriangle, ChevronRight } from "./icons.ts";

export function WorkDetails({ id, ids, messageIds, open, active, since, transitionActivity }: Omit<FoldRow, "kind"> & { transitionActivity?: (id: string, update: () => void) => void }) {
  const showFailedTools = useApp(state => state.showFailedTools);
  const [, setOpen] = useDisclosure(id, "activity");
  const tools = useApp(useShallow(state => ids.map(id => state.parts.get(id)).filter((part): part is ToolPart => part?.kind === "tool")));
  const lastMessageAt = useApp(state => Math.max(...messageIds.map(id => state.messages[id]?.ts ?? since)));
  const endedAt = Math.max(lastMessageAt, ...tools.map(tool => tool.endedAt ?? tool.startedAt));
  const { failed } = groupStats(tools);
  return (
    <button id={`fold-${id}`} className="work-fold" type="button" aria-expanded={open} onClick={() => {
      const update = () => setOpen(value => !value);
      if (transitionActivity) transitionActivity(id, update);
      else update();
    }}>
      <span>{active ? `${ids.length} ${ids.length === 1 ? "step" : "steps"}` : `Worked for ${duration(Math.max(0, endedAt - since))}`}</span>
      {showFailedTools && failed > 0 && <span className="group-failed"><AlertTriangle size={11} aria-hidden="true" />{failed === 1 ? "1 failed tool" : `${failed} failed tools`}</span>}
      <ChevronRight size={12} className="group-chevron" aria-hidden="true" />
    </button>
  );
}
