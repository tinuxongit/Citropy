import { useId } from "react";

const TILE = { x: 2, y: 2, width: 20, height: 20, rx: 5.5 };
const BAR_WIDTH = 2.75;
const BASELINE = 16.5;
const BARS = [{ x: 7.5, top: 12.5 }, { x: 12, top: 9.5 }, { x: 16.5, top: 6.75 }];

export function ChartIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {BARS.map(({ x, top }) => <line key={x} x1={x} y1={top} x2={x} y2={BASELINE} stroke="black" strokeWidth={BAR_WIDTH} strokeLinecap="round" />)}
        </mask>
      </defs>
      <rect {...TILE} mask={`url(#${id})`} />
    </svg>
  );
}
