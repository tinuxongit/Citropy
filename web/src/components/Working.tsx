import { useRef } from "react";
import { useAnimationClock } from "../lib/animation-clock.ts";
import { useSecondClock } from "../lib/use-second-clock.ts";
import type { ThreadStatus } from "../../../shared/protocol.ts";
import { duration } from "../lib/format.ts";
import { toolLabel } from "../lib/group.ts";
import { useApp } from "../lib/store.ts";
import { AnimatedText } from "./AnimatedText.tsx";

const SPIRAL = [0, 1, 2, 7, 8, 3, 6, 5, 4];

const WAITING: Partial<Record<ThreadStatus, string>> = {
  queued: "Queued",
  awaiting: "Needs input",
};

export function Working({ messageIds }: { messageIds: string[] }) {
  const thread = useApp(state => state.threads[state.activeThreadId ?? ""]);
  const tool = useApp(state => {
    const running = messageIds.flatMap(id => state.messages[id]?.partIds ?? []).map(id => state.parts.get(id))
      .findLast(part => part?.kind === "tool" && part.status === "running");
    if (running?.kind !== "tool") return undefined;
    const label = toolLabel(running.name, running.status);
    return running.shape === "generic" || !running.headline ? label : `${label} ${running.headline}`;
  });
  const startedAt = thread?.runStartedAt ?? thread?.updatedAt ?? 0;
  const now = useSecondClock(startedAt);
  const grid = useRef<HTMLSpanElement>(null);
  useAnimationClock(grid);

  const text = thread?.compacting ? "Compacting context" : (thread?.status && WAITING[thread.status]) || tool || "Thinking";

  return (
    <span className="working">
      <span className="working-grid" ref={grid} aria-hidden="true">
        {SPIRAL.map((step, index) => <i key={index} style={{ animationDelay: `${step * 150 - 1350}ms` }} />)}
      </span>
      <span className="working-text truncate" role="status"><AnimatedText text={text} /></span>
      <span className="working-time">{duration(Math.max(0, now - startedAt))}</span>
    </span>
  );
}
