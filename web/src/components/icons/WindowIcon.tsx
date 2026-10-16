import { useId } from "react";

const FRAME = { x: 2, y: 3, width: 20, height: 18, rx: 4 };
const TITLE_BAR_Y = 8.5;
const LINE_WIDTH = 1.5;
const BUTTONS = [5.75, 8.75];
const BUTTON_RADIUS = 1;

export function WindowIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={`M0 ${TITLE_BAR_Y}H24`} stroke="black" strokeWidth={LINE_WIDTH} />
          {BUTTONS.map((x) => <circle key={x} cx={x} cy={(FRAME.y + TITLE_BAR_Y) / 2} r={BUTTON_RADIUS} fill="black" />)}
        </mask>
      </defs>
      <rect {...FRAME} mask={`url(#${id})`} />
    </svg>
  );
}
