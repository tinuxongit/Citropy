import { useId } from "react";

const CENTER = { x: 12, y: 14 };
const RADIUS = 9;
const ARC_WIDTH = 3.5;
const ARC_START = 200;
const ARC_END = -20;
const SEGMENTS = 3;
const SEGMENT_GAP = 1.5;
const NEEDLE = { angle: 50, length: 5, width: 2.5 };
const HUB_RADIUS = 2.5;

function polar(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: CENTER.x + radius * Math.cos(radians), y: CENTER.y - radius * Math.sin(radians) };
}

const start = polar(ARC_START, RADIUS);
const end = polar(ARC_END, RADIUS);
const ARC = `M${start.x} ${start.y}A${RADIUS} ${RADIUS} 0 1 1 ${end.x} ${end.y}`;
const GAP_ANGLES = Array.from({ length: SEGMENTS - 1 }, (_, index) => ARC_START - ((ARC_START - ARC_END) / SEGMENTS) * (index + 1));

export function UsageIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  const needleTip = polar(NEEDLE.angle, NEEDLE.length);
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {GAP_ANGLES.map((angle) => {
            const outer = polar(angle, RADIUS + ARC_WIDTH);
            return <line key={angle} x1={CENTER.x} y1={CENTER.y} x2={outer.x} y2={outer.y} stroke="black" strokeWidth={SEGMENT_GAP} />;
          })}
        </mask>
      </defs>
      <path d={ARC} fill="none" stroke="currentColor" strokeWidth={ARC_WIDTH} strokeLinecap="round" mask={`url(#${id})`} />
      <line x1={CENTER.x} y1={CENTER.y} x2={needleTip.x} y2={needleTip.y} stroke="currentColor" strokeWidth={NEEDLE.width} strokeLinecap="round" />
      <circle cx={CENTER.x} cy={CENTER.y} r={HUB_RADIUS} />
    </svg>
  );
}
