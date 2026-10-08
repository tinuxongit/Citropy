import { useId } from "react";

const CENTER = 12;
const OUTER_RADIUS = 10;
const RING_INNER_RADIUS = 6.5;
const DOT_RADIUS = 3;

export function IssueIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <circle cx={CENTER} cy={CENTER} r={RING_INNER_RADIUS} fill="black" />
        </mask>
      </defs>
      <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} mask={`url(#${id})`} />
      <circle cx={CENTER} cy={CENTER} r={DOT_RADIUS} />
    </svg>
  );
}
