import { Activity, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { markPanelMotion } from "../lib/panel-motion.ts";
import { useLaggedValue } from "../lib/use-lagged-value.ts";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";

export function SlidingPanel({ open, side, keepMounted = false, pauseHidden = false, children }: {
  open: boolean;
  side: "left" | "right";
  keepMounted?: boolean;
  pauseHidden?: boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [present, setPresent] = useState(open);
  const animate = useLaggedValue(true, false);
  const shown = useLaggedValue(open);
  const duration = reducedMotion ? 0 : 280;
  useLayoutEffect(() => {
    if (animate) markPanelMotion(duration);
  }, [shown]);
  useEffect(() => {
    if (open || shown) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => clearTimeout(timer);
  }, [open, shown, duration]);
  if (!open && !present && !keepMounted) return null;
  return <div
    className="sliding-panel"
    data-side={side}
    data-open={open}
    data-shown={shown}
    data-animate={animate}
    hidden={!open && !present}
    inert={!open}
    aria-hidden={!open || undefined}
    style={{ "--panel-duration": `${duration}ms` } as CSSProperties}
  >{pauseHidden ? <Activity mode={open || present ? "visible" : "hidden"}>{children}</Activity> : children}</div>;
}
