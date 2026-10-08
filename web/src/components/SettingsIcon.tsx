import { useId } from "react";

const CENTER = 12;
const BODY_RADIUS = 7.5;
const HOLE_RADIUS = 3.25;
const TEETH = 6;
const TOOTH = { width: 4.5, top: 1.5, rx: 1.5 };

export function SettingsIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <circle cx={CENTER} cy={CENTER} r={HOLE_RADIUS} fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <circle cx={CENTER} cy={CENTER} r={BODY_RADIUS} />
        {Array.from({ length: TEETH }, (_, index) => (
          <rect
            key={index}
            x={CENTER - TOOTH.width / 2}
            y={TOOTH.top}
            width={TOOTH.width}
            height={CENTER - TOOTH.top}
            rx={TOOTH.rx}
            transform={`rotate(${(360 / TEETH) * index} ${CENTER} ${CENTER})`}
          />
        ))}
      </g>
    </svg>
  );
}
