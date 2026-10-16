import { useId } from "react";

const FRONT_CARD = { x: 2.5, y: 7, width: 16, height: 14.5, rx: 3.5 };
const BACK_CARD = { x: 6.5, y: 2.5, width: 15, height: 13.5, rx: 3 };
const CARD_GAP = 3;
const PULSE = "M5 14.25h2.5l2-3.75 3 7.5 2-3.75h2";
const PULSE_WIDTH = 2;

export function AgentsIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={`${id}-back`}>
          <rect width="24" height="24" fill="white" />
          <rect {...FRONT_CARD} fill="black" stroke="black" strokeWidth={CARD_GAP} />
        </mask>
        <mask id={`${id}-front`}>
          <rect width="24" height="24" fill="white" />
          <path d={PULSE} fill="none" stroke="black" strokeWidth={PULSE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <rect {...BACK_CARD} mask={`url(#${id}-back)`} />
      <rect {...FRONT_CARD} mask={`url(#${id}-front)`} />
    </svg>
  );
}
