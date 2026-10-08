import { useId } from "react";

const TILE = { x: 2, y: 2, width: 20, height: 20, rx: 5.5 };
const PULSE = "M5.5 12.5H8.5L10.5 8L13.5 16L15.5 12.5H18.5";
const PULSE_WIDTH = 2;

export function PulseIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={PULSE} fill="none" stroke="black" strokeWidth={PULSE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <rect {...TILE} mask={`url(#${id})`} />
    </svg>
  );
}
