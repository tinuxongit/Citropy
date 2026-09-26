import { useEffect, useRef, useState } from "react";
import { useAnimationClock } from "../lib/animation-clock.ts";
import type { ThreadStatus } from "../../../shared/protocol.ts";
import { duration } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.ts";
import { AnimatedText } from "./AnimatedText.tsx";

interface Props {
  status: ThreadStatus | undefined;
  tool?: string;
  compacting?: boolean;
  startedAt: number;
}

const SPIRAL = [0, 1, 2, 7, 8, 3, 6, 5, 4];

const LABEL: Partial<Record<ThreadStatus, string>> = {
  queued: "Queued",
  thinking: "Thinking",
  working: "Working",
  awaiting: "Needs input",
};

export function Working({ status, tool, compacting, startedAt }: Props) {
  const t = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const grid = useRef<HTMLSpanElement>(null);
  useAnimationClock(grid);

  useEffect(() => {
    let timer = 0;
    const update = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const now = Date.now();
      setNow(now);
      timer = window.setTimeout(update, 1000 - ((now - startedAt + 500) % 1000));
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [startedAt]);

  const text = compacting ? t("Compacting context") : tool ? `${t("Running")} ${tool}` : t((status && LABEL[status]) || "Working");

  return (
    <span className="working">
      <span className="working-grid" ref={grid} aria-hidden="true">
        {SPIRAL.map((step, index) => <i key={index} style={{ animationDelay: `${step * 150 - 1350}ms` }} />)}
      </span>
      <span className="working-text" role="status"><AnimatedText text={text} /></span>
      <span className="working-time">{duration(Math.max(0, now - startedAt))}</span>
    </span>
  );
}
