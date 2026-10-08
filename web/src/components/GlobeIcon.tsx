import { useId } from "react";

const CENTER = 12;
const RADIUS = 10;
const MERIDIAN = { rx: 4, ry: 10 };
const LATITUDE = "M2 12H22";
const LINE_WIDTH = 1.75;

export function GlobeIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <ellipse cx={CENTER} cy={CENTER} {...MERIDIAN} fill="none" stroke="black" strokeWidth={LINE_WIDTH} />
          <path d={LATITUDE} stroke="black" strokeWidth={LINE_WIDTH} />
        </mask>
      </defs>
      <circle cx={CENTER} cy={CENTER} r={RADIUS} mask={`url(#${id})`} />
    </svg>
  );
}
