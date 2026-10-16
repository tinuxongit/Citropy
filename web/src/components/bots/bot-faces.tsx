import type { ReactNode } from "react";
import type { BotFace } from "../../../../shared/bots.ts";

export const EYE_SPREAD = 3.4;
const PILL = { width: 3.2, height: 6.6 };

function pill(x: number, y: number, tilt: number, height = PILL.height): ReactNode {
  return (
    <rect
      key={x}
      className="bot-eye"
      x={x - PILL.width / 2}
      y={y - height / 2}
      width={PILL.width}
      height={height}
      rx={PILL.width / 2}
      transform={`rotate(${tilt} ${x} ${y})`}
    />
  );
}

function stroke(x: number, d: string): ReactNode {
  return <path key={x} className="bot-eye-line" d={d} transform={`translate(${x} 0)`} />;
}

function bar(x: number, tilt: number): ReactNode {
  return (
    <rect
      key={x}
      className="bot-eye"
      x={x - 2.6}
      y={-1.2}
      width={5.2}
      height={2.4}
      rx={1.2}
      transform={`rotate(${tilt} ${x} 0)`}
    />
  );
}

function mark(x: number, d: string): ReactNode {
  return <path key={x} className="bot-eye" data-soft="" d={d} transform={`translate(${x} 0)`} />;
}

const HAPPY_ARC = "M-2.2 1.2Q0 -2.2 2.2 1.2";
const CROSS = "M-1.7 -1.7L1.7 1.7M1.7 -1.7L-1.7 1.7";
const HEART =
  "M0 2.4C-1.6 1.3 -2.7 0.2 -2.7 -0.9A1.4 1.4 0 0 1 0 -1.6A1.4 1.4 0 0 1 2.7 -0.9C2.7 0.2 1.6 1.3 0 2.4Z";

const FACES: Record<BotFace, ReactNode[]> = {
  neutral: [pill(-EYE_SPREAD, 0.5, -24), pill(EYE_SPREAD, -0.5, 0)],
  attentive: [pill(-EYE_SPREAD, 0, 0), pill(EYE_SPREAD, 0, 0)],
  surprised: [-EYE_SPREAD, EYE_SPREAD].map((x) => (
    <circle key={x} className="bot-eye" cx={x} cy={0} r={2.3} />
  )),
  happy: [-EYE_SPREAD, EYE_SPREAD].map((x) => stroke(x, HAPPY_ARC)),
  sad: [pill(-EYE_SPREAD, 0.4, 28, 5.4), pill(EYE_SPREAD, 0.4, -28, 5.4)],
  angry: [bar(-EYE_SPREAD, 22), bar(EYE_SPREAD, -22)],
  sleepy: [-EYE_SPREAD, EYE_SPREAD].map((x) => stroke(x, "M-2.2 -0.6Q0 1.8 2.2 -0.6")),
  wink: [pill(-EYE_SPREAD, 0, 0), stroke(EYE_SPREAD, HAPPY_ARC)],
  hearts: [-EYE_SPREAD, EYE_SPREAD].map((x) => mark(x, HEART)),
  "x-eyes": [-EYE_SPREAD, EYE_SPREAD].map((x) => stroke(x, CROSS)),
};

export function BotEyes({ face }: { face: BotFace }) {
  return <g className="bot-eyes">{FACES[face]}</g>;
}
