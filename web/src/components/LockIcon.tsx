import { useId } from "react";

const BODY = { x: 4, y: 10, width: 16, height: 12, rx: 3.5 };
const KEYHOLE = { cx: 12, cy: 15, r: 1.75 };
const KEYHOLE_SLOT = "M12 15v3";
const KEYHOLE_SLOT_WIDTH = 1.75;
const SHACKLE_WIDTH = 2.5;
const CLOSED_SHACKLE = "M7.75 10V7.25a4.25 4.25 0 0 1 8.5 0V10";
const OPEN_SHACKLE = "M7.75 10V7.25a4.25 4.25 0 0 1 8.2-1.6";

function Lock({ size, shackle }: { size: number; shackle: string }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <circle {...KEYHOLE} fill="black" />
          <path d={KEYHOLE_SLOT} stroke="black" strokeWidth={KEYHOLE_SLOT_WIDTH} strokeLinecap="round" />
        </mask>
      </defs>
      <path d={shackle} fill="none" stroke="currentColor" strokeWidth={SHACKLE_WIDTH} strokeLinecap="round" />
      <rect {...BODY} mask={`url(#${id})`} />
    </svg>
  );
}

export function LockIcon({ size = 24 }: { size?: number }) {
  return <Lock size={size} shackle={CLOSED_SHACKLE} />;
}

export function UnlockIcon({ size = 24 }: { size?: number }) {
  return <Lock size={size} shackle={OPEN_SHACKLE} />;
}
