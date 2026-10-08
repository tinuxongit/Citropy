import { useId } from "react";

const BODY = { x: 5, y: 1.5, width: 14, height: 21, rx: 3.5 };
const HOME_BAR = { y: 18.75, from: 10, to: 14 };
const HOME_BAR_WIDTH = 1.75;

export function PhoneIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={`M${HOME_BAR.from} ${HOME_BAR.y}H${HOME_BAR.to}`} stroke="black" strokeWidth={HOME_BAR_WIDTH} strokeLinecap="round" />
        </mask>
      </defs>
      <rect {...BODY} mask={`url(#${id})`} />
    </svg>
  );
}
