import type { CSSProperties, ReactNode } from "react";
import type { BotShape } from "../../../../shared/bots.ts";

export const BOT_VIEWBOX = 40;

export type Point = { x: number; y: number };
export type Anchor = Point & { angle: number };
export type HatLine = Anchor & { width: number };

export interface ShapeGeometry {
  body: ReactNode;
  face: Point;
  top: Anchor;
  hat: HatLine;
  brow: Anchor;
  ears: [Anchor, Anchor];
}

const CLASSIC_FACE = { x: 17.4, y: 21.3 };

function circles(list: { cx: number; cy: number; r: number }[]): ReactNode {
  return <g className="bot-body">{list.map((circle) => <circle key={`${circle.cx}:${circle.cy}`} {...circle} />)}</g>;
}

function rounded(points: string, radius: number): ReactNode {
  return <polygon className="bot-body" data-rounded="" points={points} style={{ "--bot-round": radius * 2 } as CSSProperties} />;
}

const SHAPES: Record<BotShape, ShapeGeometry> = {
  cloud: {
    body: circles([
      { cx: 13, cy: 23, r: 8.5 },
      { cx: 21, cy: 15.5, r: 9 },
      { cx: 28.5, cy: 20.5, r: 8 },
      { cx: 20, cy: 25.5, r: 9 },
      { cx: 29, cy: 26.5, r: 6.5 },
    ]),
    face: CLASSIC_FACE,
    top: { x: 21, y: 7, angle: 0 },
    hat: { x: 21, y: 10.5, angle: 0, width: 14.8 },
    brow: { x: 21, y: 14.2, angle: 0 },
    ears: [{ x: 15.9, y: 9.4, angle: -40 }, { x: 26.1, y: 9.4, angle: 40 }],
  },
  drop: {
    body: <path className="bot-body" d="M20 4.5C26 11.5 32.5 18 32.5 24.5A12.5 12.5 0 0 1 7.5 24.5C7.5 18 14 11.5 20 4.5Z" />,
    face: CLASSIC_FACE,
    top: { x: 20, y: 7.5, angle: 0 },
    hat: { x: 20, y: 12, angle: 0, width: 12.8 },
    brow: { x: 20, y: 15, angle: 0 },
    ears: [{ x: 14.5, y: 12.4, angle: -45 }, { x: 25.5, y: 12.4, angle: 45 }],
  },
  pebble: {
    body: <ellipse className="bot-body" cx={20} cy={21} rx={15} ry={12.5} transform="rotate(-12 20 21)" />,
    face: CLASSIC_FACE,
    top: { x: 17.4, y: 9.3, angle: -12 },
    hat: { x: 17.75, y: 10.45, angle: -12, width: 15 },
    brow: { x: 18.3, y: 13.4, angle: -12 },
    ears: [{ x: 9.3, y: 14.3, angle: -47 }, { x: 27, y: 10.6, angle: 23 }],
  },
  block: {
    body: <rect className="bot-body" x={7} y={8} width={26} height={25} rx={9} />,
    face: CLASSIC_FACE,
    top: { x: 20, y: 8.5, angle: 0 },
    hat: { x: 20, y: 9, angle: 0, width: 16.2 },
    brow: { x: 20, y: 13.6, angle: 0 },
    ears: [{ x: 11.4, y: 10.4, angle: -35 }, { x: 28.6, y: 10.4, angle: 35 }],
  },
  circle: {
    body: <circle className="bot-body" cx={20} cy={21} r={13} />,
    face: { x: 17.4, y: 21 },
    top: { x: 20, y: 8.5, angle: 0 },
    hat: { x: 20, y: 10.5, angle: 0, width: 15.2 },
    brow: { x: 20, y: 14.2, angle: 0 },
    ears: [{ x: 12.3, y: 11.8, angle: -40 }, { x: 27.7, y: 11.8, angle: 40 }],
  },
  capsule: {
    body: <rect className="bot-body" x={5} y={12} width={30} height={20} rx={10} />,
    face: { x: 17.4, y: 22 },
    top: { x: 20, y: 12.5, angle: 0 },
    hat: { x: 20, y: 12.5, angle: 0, width: 16.2 },
    brow: { x: 20, y: 15.4, angle: 0 },
    ears: [{ x: 11.9, y: 13.5, angle: -20 }, { x: 28.1, y: 13.5, angle: 20 }],
  },
  triangle: {
    body: rounded("20,10 32.5,31 7.5,31", 3),
    face: { x: 18.5, y: 24 },
    top: { x: 20, y: 8, angle: 0 },
    hat: { x: 20, y: 14, angle: 0, width: 11.6 },
    brow: { x: 20, y: 17.2, angle: 0 },
    ears: [{ x: 14.5, y: 15.3, angle: -50 }, { x: 25.5, y: 15.3, angle: 50 }],
  },
  hexagon: {
    body: rounded("32,21 26,31.4 14,31.4 8,21 14,10.6 26,10.6", 2.5),
    face: { x: 17.4, y: 21 },
    top: { x: 20, y: 8.5, angle: 0 },
    hat: { x: 20, y: 9, angle: 0, width: 15.8 },
    brow: { x: 20, y: 14.2, angle: 0 },
    ears: [{ x: 14.5, y: 10, angle: -30 }, { x: 25.5, y: 10, angle: 30 }],
  },
  heart: {
    body: <path className="bot-body" d="M20 33C14 28.5 5.5 23 5.5 15A7.5 7.5 0 0 1 20 12.5A7.5 7.5 0 0 1 34.5 15C34.5 23 26 28.5 20 33Z" />,
    face: { x: 18.5, y: 19 },
    top: { x: 28.8, y: 8.4, angle: 15 },
    hat: { x: 28, y: 11.3, angle: 15, width: 12.7 },
    brow: { x: 20, y: 12.8, angle: 0 },
    ears: [{ x: 10.3, y: 9.3, angle: -25 }, { x: 29.7, y: 9.3, angle: 25 }],
  },
  star: {
    body: rounded("20,7.5 24.7,15 33.3,17.2 27.6,24 28.2,32.8 20,29.5 11.8,32.8 12.4,24 6.7,17.2 15.3,15", 2),
    face: { x: 19, y: 21.5 },
    top: { x: 20, y: 6.5, angle: 0 },
    hat: { x: 20, y: 13, angle: 0, width: 11.6 },
    brow: { x: 20, y: 10.4, angle: 0 },
    ears: [{ x: 12.6, y: 15.8, angle: -50 }, { x: 27.4, y: 15.8, angle: 50 }],
  },
  flower: {
    body: circles([
      { cx: 20, cy: 13.5, r: 6.5 },
      { cx: 26.5, cy: 17.25, r: 6.5 },
      { cx: 26.5, cy: 24.75, r: 6.5 },
      { cx: 20, cy: 28.5, r: 6.5 },
      { cx: 13.5, cy: 24.75, r: 6.5 },
      { cx: 13.5, cy: 17.25, r: 6.5 },
      { cx: 20, cy: 21, r: 8 },
    ]),
    face: { x: 18.2, y: 21 },
    top: { x: 20, y: 7.5, angle: 0 },
    hat: { x: 20, y: 10.5, angle: 0, width: 11.4 },
    brow: { x: 20, y: 13.4, angle: 0 },
    ears: [{ x: 10.8, y: 12.5, angle: -30 }, { x: 29.2, y: 12.5, angle: 30 }],
  },
  house: {
    body: rounded("20,8.5 31.5,17 31.5,32 8.5,32 8.5,17", 2.5),
    face: { x: 17.4, y: 23.5 },
    top: { x: 20, y: 7, angle: 0 },
    hat: { x: 20, y: 11, angle: 0, width: 15 },
    brow: { x: 20, y: 16.4, angle: 0 },
    ears: [{ x: 13.9, y: 11.1, angle: -36 }, { x: 26.1, y: 11.1, angle: 36 }],
  },
};

export function shapeGeometry(shape: BotShape): ShapeGeometry {
  return SHAPES[shape];
}
