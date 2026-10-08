import { useId } from "react";

const NODES = [{ x: 6, y: 5 }, { x: 6, y: 19 }, { x: 18, y: 19 }];
const NODE_RADIUS = 3;
const GAP = 1.25;
const LINE_WIDTH = 2.5;
const LINES = "M6 5V19M18 19V10.5A3.5 3.5 0 0 0 14.5 7H10.5";
const ARROW = "M13 3.5L9.5 7L13 10.5Z";

export function PullRequestIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {NODES.map(({ x, y }) => <circle key={`${x}:${y}`} cx={x} cy={y} r={NODE_RADIUS + GAP} fill="black" />)}
        </mask>
      </defs>
      <path d={LINES} fill="none" stroke="currentColor" strokeWidth={LINE_WIDTH} strokeLinecap="round" mask={`url(#${id})`} />
      <path d={ARROW} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      {NODES.map(({ x, y }) => <circle key={`${x}:${y}`} cx={x} cy={y} r={NODE_RADIUS} />)}
    </svg>
  );
}
