import { useId } from "react";

const APP_TILE = { x: 2, y: 5, width: 17, height: 17, rx: 4.5 };
const BADGE = { cx: 17.5, cy: 6.5, r: 6 };
const BADGE_GAP = 1.5;
const ARROW = "M17.5 9.75v-6.5M14.75 6l2.75-2.75L20.25 6";
const ARROW_WIDTH = 2;

export function UpdateIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={`${id}-tile`}>
          <rect width="24" height="24" fill="white" />
          <circle {...BADGE} r={BADGE.r + BADGE_GAP} fill="black" />
        </mask>
        <mask id={`${id}-badge`}>
          <rect width="24" height="24" fill="white" />
          <path d={ARROW} fill="none" stroke="black" strokeWidth={ARROW_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <rect {...APP_TILE} mask={`url(#${id}-tile)`} />
      <circle {...BADGE} mask={`url(#${id}-badge)`} />
    </svg>
  );
}
