import { useId } from "react";

const CENTER = 12;
const RADIUS = 10;
const TRIANGLE = "M10 8.25L15.5 12L10 15.75Z";
const TRIANGLE_ROUNDING = 2;

export function PlayIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={TRIANGLE} fill="black" stroke="black" strokeWidth={TRIANGLE_ROUNDING} strokeLinejoin="round" />
        </mask>
      </defs>
      <circle cx={CENTER} cy={CENTER} r={RADIUS} mask={`url(#${id})`} />
    </svg>
  );
}
