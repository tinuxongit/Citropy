import { useId } from "react";

const TRAY = "M2 12.5h5.5l1.25 2.5h6.5l1.25-2.5H22v5a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 17.5z";
const LETTER = { x: 5.5, y: 2, width: 13, height: 14, rx: 2 };
const LETTER_LINES = "M8.5 6h7M8.5 9h4.5";
const TRAY_GAP = 3;
const LINE_WIDTH = 1.5;

export function InboxIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={`${id}-tray`}>
          <rect width="24" height="24" fill="white" />
          <path d={TRAY} fill="black" stroke="black" strokeWidth={TRAY_GAP} strokeLinejoin="round" />
        </mask>
        <mask id={`${id}-lines`}>
          <rect width="24" height="24" fill="white" />
          <path d={LETTER_LINES} stroke="black" strokeWidth={LINE_WIDTH} strokeLinecap="round" />
        </mask>
      </defs>
      <g mask={`url(#${id}-tray)`}>
        <rect {...LETTER} mask={`url(#${id}-lines)`} />
      </g>
      <path d={TRAY} />
    </svg>
  );
}
