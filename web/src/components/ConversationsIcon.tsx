import { useId } from "react";

const FRONT_BUBBLE = "M4 7h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8l-4 3.5V18a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z";
const BACK_BUBBLE = "M11 2h9a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3v3l-3.5-3H11a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z";
const BUBBLE_GAP = 3;
const TYPING_DOTS = [4.5, 8, 11.5];

export function ConversationsIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={`${id}-back`}>
          <rect width="24" height="24" fill="white" />
          <path d={FRONT_BUBBLE} fill="black" stroke="black" strokeWidth={BUBBLE_GAP} strokeLinejoin="round" />
        </mask>
        <mask id={`${id}-front`}>
          <rect width="24" height="24" fill="white" />
          {TYPING_DOTS.map(x => <circle key={x} cx={x} cy="12.5" r="1.25" fill="black" />)}
        </mask>
      </defs>
      <path d={BACK_BUBBLE} mask={`url(#${id}-back)`} />
      <path d={FRONT_BUBBLE} mask={`url(#${id}-front)`} />
    </svg>
  );
}
