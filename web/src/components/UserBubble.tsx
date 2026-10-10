import type { CSSProperties } from "react";
import { PartView } from "./PartView.tsx";
import { useApp } from "../lib/store.ts";
import { useDisclosure } from "../lib/use-disclosure.ts";
import type { MentionTag } from "../../../shared/mention-tags.ts";

const COLLAPSE_AFTER_LINES = 16;
const SHOWN_LINES = 10;
const WRAP_CHARS = 90;

function estimatedLines(text: string): number {
  return text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / WRAP_CHARS)), 0);
}

export function UserBubble({ partIds, mentions }: { partIds: string[]; mentions?: MentionTag[] }) {
  const long = useApp((state) => partIds.reduce((sum, id) => {
    const part = state.parts.get(id);
    return sum + (part?.kind === "text" ? estimatedLines(part.text) : 0);
  }, 0) > COLLAPSE_AFTER_LINES);
  const [expanded, setExpanded] = useDisclosure(partIds[0], "expanded");
  const collapsed = long && !expanded;
  return (
    <>
      <div className="message-bubble user-card" data-collapsed={collapsed || undefined} style={{ "--shown-lines": SHOWN_LINES } as CSSProperties}>
        {partIds.map((id) => (
          <PartView key={id} partId={id} live={false} mentions={mentions} />
        ))}
      </div>
      {long && (
        <button type="button" className="user-card-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}
