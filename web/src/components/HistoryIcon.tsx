import { useId } from "react";

const CENTER = 12;
const RING_RADIUS = 9.25;
const RING_WIDTH = 2.25;
const RING_FROM = 205;
const RING_TO = -115;
const ARROW = { length: 3.5, width: 5 };
const FACE_RADIUS = 5.75;
const HANDS = "M12 9V12L14 13.25";
const HAND_WIDTH = 1.75;

function polar(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER - radius * Math.sin(radians) };
}

const ringStart = polar(RING_FROM, RING_RADIUS);
const ringEnd = polar(RING_TO, RING_RADIUS);
const RING = `M${ringStart.x} ${ringStart.y}A${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${ringEnd.x} ${ringEnd.y}`;

function arrowHead() {
  const radians = (RING_FROM * Math.PI) / 180;
  const along = { x: -Math.sin(radians), y: -Math.cos(radians) };
  const outward = { x: Math.cos(radians), y: -Math.sin(radians) };
  const tip = { x: ringStart.x + along.x * ARROW.length, y: ringStart.y + along.y * ARROW.length };
  const inner = { x: ringStart.x - outward.x * ARROW.width / 2, y: ringStart.y - outward.y * ARROW.width / 2 };
  const outer = { x: ringStart.x + outward.x * ARROW.width / 2, y: ringStart.y + outward.y * ARROW.width / 2 };
  return `M${tip.x} ${tip.y}L${inner.x} ${inner.y}L${outer.x} ${outer.y}Z`;
}

const ARROW_HEAD = arrowHead();

export function HistoryIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <path d={HANDS} fill="none" stroke="black" strokeWidth={HAND_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d={RING} fill="none" stroke="currentColor" strokeWidth={RING_WIDTH} strokeLinecap="round" />
      <path d={ARROW_HEAD} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      <circle cx={CENTER} cy={CENTER} r={FACE_RADIUS} mask={`url(#${id})`} />
    </svg>
  );
}
