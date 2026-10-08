import { useId } from "react";

const NODES = [{ x: 6.5, y: 5 }, { x: 6.5, y: 19 }, { x: 17.5, y: 5 }];
const NODE_RADIUS = 3;
const GAP = 1.25;
const LINE_WIDTH = 2.5;
const LINES = "M6.5 5V19M17.5 5C17.5 12.5 6.5 10.5 6.5 16";

export function BranchIcon({ size = 24 }: { size?: number }) {
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
      {NODES.map(({ x, y }) => <circle key={`${x}:${y}`} cx={x} cy={y} r={NODE_RADIUS} />)}
    </svg>
  );
}
