import { useId } from "react";

const TILE = { x: 2, y: 2, width: 20, height: 20, rx: 5.5 };
const ROWS = [8.5, 15.5];
const CHECK = (y: number) => `M6 ${y}l1.75 1.75L11 ${y - 1.75}`;
const LINE = (y: number) => `M13.75 ${y}H18`;
const CUT_WIDTH = 2;

export function PlanIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path
            d={ROWS.map(y => CHECK(y) + LINE(y)).join("")}
            fill="none"
            stroke="black"
            strokeWidth={CUT_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <rect {...TILE} mask={`url(#${id})`} />
    </svg>
  );
}
