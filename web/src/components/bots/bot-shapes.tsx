import type { BotShape } from "../../../../shared/bots.ts";

export const BOT_VIEWBOX = 40;

const CLOUD = [
  { cx: 13, cy: 23, r: 8.5 },
  { cx: 21, cy: 15.5, r: 9 },
  { cx: 28.5, cy: 20.5, r: 8 },
  { cx: 20, cy: 25.5, r: 9 },
  { cx: 29, cy: 26.5, r: 6.5 },
];
const DROP = "M20 4.5C26 11.5 32.5 18 32.5 24.5A12.5 12.5 0 0 1 7.5 24.5C7.5 18 14 11.5 20 4.5Z";
const EYES = [
  { x: 12.4, y: 18.5, tilt: -24 },
  { x: 19.2, y: 17.5, tilt: 0 },
];
const EYE = { width: 3.2, height: 6.6 };

export function BotBody({ shape }: { shape: BotShape }) {
  switch (shape) {
    case "cloud":
      return <g className="bot-body">{CLOUD.map((circle) => <circle key={`${circle.cx}:${circle.cy}`} {...circle} />)}</g>;
    case "drop":
      return <path className="bot-body" d={DROP} />;
    case "pebble":
      return <ellipse className="bot-body" cx={20} cy={21} rx={15} ry={12.5} transform="rotate(-12 20 21)" />;
    case "block":
      return <rect className="bot-body" x={7} y={8} width={26} height={25} rx={9} />;
  }
}

export function BotEyes() {
  return (
    <g className="bot-eyes">
      {EYES.map((eye) => (
        <rect
          key={eye.x}
          className="bot-eye"
          x={eye.x}
          y={eye.y}
          width={EYE.width}
          height={EYE.height}
          rx={EYE.width / 2}
          transform={`rotate(${eye.tilt} ${eye.x + EYE.width / 2} ${eye.y + EYE.height / 2})`}
        />
      ))}
    </g>
  );
}
