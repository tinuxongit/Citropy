import { useId } from "react";

const BASE = { x: 2, y: 12, width: 20, height: 8.5, rx: 4.25 };
const PUFFS = [{ cx: 8.25, cy: 12, r: 4.5 }, { cx: 14, cy: 10, r: 6 }];
const ARROW = "M12 17.5V11M9.25 13.5L12 10.75L14.75 13.5";
const ARROW_WIDTH = 2;

export function RemoteIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={ARROW} fill="none" stroke="black" strokeWidth={ARROW_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <rect {...BASE} />
        {PUFFS.map((puff) => <circle key={puff.cx} {...puff} />)}
      </g>
    </svg>
  );
}
