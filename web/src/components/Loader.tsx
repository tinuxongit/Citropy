import { useId, useState, type CSSProperties, type SVGProps } from "react";

const VIEW_BOX = 24;
const CENTER = VIEW_BOX / 2;
const FILTER_MARGIN = 4;
const DROPS = 3;
const DROP_RADIUS = 4.75;
const SPREAD = 6.75;
const LOOP_MS = 2400;
const SECTORS_PER_LOOP = 2;
const TURN_DEGREES = (360 / DROPS) * SECTORS_PER_LOOP;
const TURN_EASE = "cubic-bezier(0.5, 0.25, 0.5, 0.75)";
const BLUR = 1.4;
const EDGE_PIXELS_PER_STEP = 3.5;
const MIN_SHARPNESS = 3;

const PUSHES = Array.from({ length: DROPS }, (_, drop): CSSProperties => {
  const angle = (drop / DROPS) * Math.PI * 2 - Math.PI / 2;
  return { "--loader-dx": `${Math.cos(angle) * SPREAD}px`, "--loader-dy": `${Math.sin(angle) * SPREAD}px` } as CSSProperties;
});

function sharedPhase(): CSSProperties {
  return {
    "--loader-loop": `${LOOP_MS}ms`,
    "--loader-start": `${-(performance.now() % LOOP_MS)}ms`,
    "--loader-turn": `${TURN_DEGREES}deg`,
    "--loader-turn-ease": TURN_EASE,
  } as CSSProperties;
}

export function Loader({ size = 16, className, style, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  const id = useId();
  const [phase] = useState(sharedPhase);
  const sharpness = Math.max(MIN_SHARPNESS, size / EDGE_PIXELS_PER_STEP);
  return (
    <svg
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
      className={className ? `loader ${className}` : "loader"}
      style={{ ...phase, filter: `url(#${id})`, ...style }}
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      fill="currentColor"
    >
      <defs>
        <filter
          id={id}
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          x={-FILTER_MARGIN / VIEW_BOX}
          y={-FILTER_MARGIN / VIEW_BOX}
          width={1 + (2 * FILTER_MARGIN) / VIEW_BOX}
          height={1 + (2 * FILTER_MARGIN) / VIEW_BOX}
        >
          <feGaussianBlur stdDeviation={BLUR / VIEW_BOX} />
          <feColorMatrix values={`1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${sharpness} ${(1 - sharpness) / 2}`} />
        </filter>
      </defs>
      <g className="loader-turn">
        {PUSHES.map((push, drop) => <circle key={drop} className="loader-drop" cx={CENTER} cy={CENTER} r={DROP_RADIUS} style={push} />)}
      </g>
    </svg>
  );
}
