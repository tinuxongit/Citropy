import { useId } from "react";

const UNITS = [3, 13.5];
const UNIT = { x: 2, width: 20, height: 7.5, rx: 2.75 };
const LIGHT_X = 6.25;
const LIGHT_RADIUS = 1.25;
const SLOT = { from: 10.5, to: 17.75 };
const SLOT_WIDTH = 1.5;

export function ServerIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {UNITS.map((y) => {
            const middle = y + UNIT.height / 2;
            return <g key={y}>
              <circle cx={LIGHT_X} cy={middle} r={LIGHT_RADIUS} fill="black" />
              <path d={`M${SLOT.from} ${middle}H${SLOT.to}`} stroke="black" strokeWidth={SLOT_WIDTH} strokeLinecap="round" />
            </g>;
          })}
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        {UNITS.map((y) => <rect key={y} {...UNIT} y={y} />)}
      </g>
    </svg>
  );
}
