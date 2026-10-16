import { useId } from "react";

const TRACKS = [{ y: 6, knob: 15.5 }, { y: 12, knob: 8 }, { y: 18, knob: 13 }];
const TRACK = { from: 3, to: 21, width: 2.25 };
const KNOB_RADIUS = 3;
const GAP = 1.5;

export function SlidersIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {TRACKS.map(({ y, knob }) => <circle key={y} cx={knob} cy={y} r={KNOB_RADIUS + GAP} fill="black" />)}
        </mask>
      </defs>
      <path
        d={TRACKS.map(({ y }) => `M${TRACK.from} ${y}H${TRACK.to}`).join("")}
        stroke="currentColor"
        strokeWidth={TRACK.width}
        strokeLinecap="round"
        mask={`url(#${id})`}
      />
      {TRACKS.map(({ y, knob }) => <circle key={y} cx={knob} cy={y} r={KNOB_RADIUS} />)}
    </svg>
  );
}
