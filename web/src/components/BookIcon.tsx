import { useId } from "react";

const COVER = { x: 3.5, y: 2, width: 17, height: 20, rx: 3.5 };
const SPINE_X = 8;
const SPINE_WIDTH = 1.75;
const LINES = "M11.5 7h5M11.5 10.5h3";
const LINE_WIDTH = 1.75;

export function BookIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={`M${SPINE_X} 0V24`} stroke="black" strokeWidth={SPINE_WIDTH} />
          <path d={LINES} stroke="black" strokeWidth={LINE_WIDTH} strokeLinecap="round" />
        </mask>
      </defs>
      <rect {...COVER} mask={`url(#${id})`} />
    </svg>
  );
}
