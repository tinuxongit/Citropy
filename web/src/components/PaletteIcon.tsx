import { useId } from "react";

const PALETTE = "M12 2C6.48 2 2 6.25 2 11.5S6.48 22 12 22c1.38 0 2.25-.9 2.25-2.1 0-.55-.2-1-.52-1.38-.32-.38-.5-.8-.5-1.32 0-1.15.93-2.2 2.1-2.2h2.42C20.4 15 22 13.4 22 10.75 22 5.9 17.52 2 12 2z";
const DOTS = [{ cx: 7, cy: 11.5 }, { cx: 9.25, cy: 7 }, { cx: 14.25, cy: 6.5 }, { cx: 17.5, cy: 10 }];
const DOT_RADIUS = 1.6;

export function PaletteIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {DOTS.map((dot) => <circle key={`${dot.cx}:${dot.cy}`} {...dot} r={DOT_RADIUS} fill="black" />)}
        </mask>
      </defs>
      <path d={PALETTE} mask={`url(#${id})`} />
    </svg>
  );
}
