import { useId } from "react";

const BACK = { x: 8, y: 2, width: 13, height: 16, rx: 3 };
const FRONT = { x: 3, y: 6, width: 13, height: 16, rx: 3 };
const GAP = 1.5;
const MARK_WIDTH = 1.75;
const PLUS = { x: 9.5, y: 11.75, arm: 2.5 };
const MINUS = { y: 17.25, from: 7, to: 12 };

export function ChangesIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={`${id}-back`}>
          <rect width="24" height="24" fill="white" />
          <rect x={FRONT.x - GAP} y={FRONT.y - GAP} width={FRONT.width + 2 * GAP} height={FRONT.height + 2 * GAP} rx={FRONT.rx + GAP} fill="black" />
        </mask>
        <mask id={`${id}-front`}>
          <rect width="24" height="24" fill="white" />
          <path
            d={`M${PLUS.x - PLUS.arm} ${PLUS.y}H${PLUS.x + PLUS.arm}M${PLUS.x} ${PLUS.y - PLUS.arm}V${PLUS.y + PLUS.arm}M${MINUS.from} ${MINUS.y}H${MINUS.to}`}
            stroke="black"
            strokeWidth={MARK_WIDTH}
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <rect {...BACK} mask={`url(#${id}-back)`} />
      <rect {...FRONT} mask={`url(#${id}-front)`} />
    </svg>
  );
}
