import { useId } from "react";

const LID = { x: 2, y: 3, width: 20, height: 5.5, rx: 2 };
const BOX = { x: 3.5, y: 10, width: 17, height: 11, rx: 3 };
const HANDLE = { y: 14, from: 9.5, to: 14.5 };
const HANDLE_WIDTH = 2;

export function StashIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={`M${HANDLE.from} ${HANDLE.y}H${HANDLE.to}`} stroke="black" strokeWidth={HANDLE_WIDTH} strokeLinecap="round" />
        </mask>
      </defs>
      <rect {...LID} />
      <rect {...BOX} mask={`url(#${id})`} />
    </svg>
  );
}
