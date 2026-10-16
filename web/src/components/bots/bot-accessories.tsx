import { useId, type ReactNode } from "react";
import type { BotAccessory, BotShape } from "../../../../shared/bots.ts";
import { EYE_SPREAD } from "./bot-faces.tsx";
import { BOT_VIEWBOX, shapeGeometry, type Anchor, type ShapeGeometry } from "./bot-shapes.tsx";

const HEADROOM_MARGIN = 1;
const LENS_OUTSET = 0.35;
const LENS_RADIUS = 3.6;

type Layer = "back" | "front" | "face";

interface PinnedArt {
  place: "top" | "ears";
  layer: Layer;
  scale: number;
  height: number;
  tilt: number;
  art: ReactNode;
}

interface HatArt {
  place: "hat";
  layer: Layer;
  opening: number;
  fit: number;
  height: number;
  art: ReactNode;
}

interface CapArt {
  place: "cap";
  layer: Layer;
  cuff: { above: number; below: number };
  pompom: { radius: number; lift: number };
}

interface FaceArt {
  place: "face";
  layer: "face";
  art: ReactNode;
}

type AccessoryArt = PinnedArt | HatArt | CapArt | FaceArt;

const LENS_X = EYE_SPREAD + LENS_OUTSET;
const BRIDGE = <path className="bot-acc-frame" d="M-0.55 -1.6Q0 -2.5 0.55 -1.6" />;
const TEMPLES = <path className="bot-acc-frame" d="M-7.3 -0.6L-8.9 -1.3M7.3 -0.6L8.9 -1.3" />;

function pair(lens: () => ReactNode): ReactNode {
  return [-LENS_X, LENS_X].map((x) => (
    <g key={x} transform={`translate(${x} 0)`}>
      {lens()}
    </g>
  ));
}

const ACCESSORIES: Record<Exclude<BotAccessory, "none">, AccessoryArt> = {
  "cat-ears": {
    place: "ears",
    layer: "back",
    scale: 1,
    height: 8.2,
    tilt: 0.8,
    art: (
      <>
        <path className="bot-acc-fur" d="M-4.6 2L-1.3 -6.6Q0 -8.8 1.3 -6.6L4.6 2Z" />
        <path className="bot-acc-inner" d="M-2.4 0.4L-0.6 -4.4Q0 -5.6 0.6 -4.4L2.4 0.4Z" />
      </>
    ),
  },
  "bunny-ears": {
    place: "ears",
    layer: "back",
    scale: 1,
    height: 15.4,
    tilt: 0.55,
    art: (
      <>
        <ellipse className="bot-acc-fur" cx={0} cy={-6.8} rx={3.1} ry={8.6} />
        <ellipse className="bot-acc-inner" cx={0} cy={-7.4} rx={1.5} ry={6} />
      </>
    ),
  },
  "dog-ears": {
    place: "ears",
    layer: "front",
    scale: 1,
    height: 3.4,
    tilt: 0.25,
    art: (
      <path
        className="bot-acc-shade"
        d="M0.4 -1.4C-2 -3.4 -6.4 -2.6 -7.6 1.2C-8.8 5.2 -7.6 9.6 -5 10.4C-2.8 11 -1.8 8.2 -1.4 5.2C-1 2.6 0.4 1 0.4 -1.4Z"
      />
    ),
  },
  "bear-ears": {
    place: "ears",
    layer: "back",
    scale: 1,
    height: 5.9,
    tilt: 1,
    art: (
      <>
        <circle className="bot-acc-fur" cx={0} cy={-1.6} r={4.3} />
        <circle className="bot-acc-inner" cx={0} cy={-1.6} r={2.3} />
      </>
    ),
  },
  "top-hat": {
    place: "hat",
    layer: "front",
    opening: 16,
    fit: 1.15,
    height: 12,
    art: (
      <>
        <rect className="bot-acc-dark" x={-5.4} y={-12} width={10.8} height={10.4} rx={1.6} />
        <rect className="bot-acc-fur" x={-5.4} y={-4.4} width={10.8} height={2} />
        <rect className="bot-acc-dark" x={-8} y={-2.4} width={16} height={2.4} rx={1.2} />
      </>
    ),
  },
  "party-hat": {
    place: "top",
    layer: "front",
    scale: 1.15,
    height: 13.3,
    tilt: 1,
    art: (
      <>
        <path
          className="bot-acc-cream"
          d="M-5 1.2L-0.9 -10.2Q0 -11.6 0.9 -10.2L5 1.2Q0 2.6 -5 1.2Z"
        />
        <circle className="bot-acc-shade" cx={-1.6} cy={-1.6} r={1} />
        <circle className="bot-acc-shade" cx={1.7} cy={-4.6} r={0.9} />
        <circle className="bot-acc-shade" cx={-0.4} cy={-7.3} r={0.75} />
        <circle className="bot-acc-shade" cx={0} cy={-11.6} r={1.7} />
      </>
    ),
  },
  crown: {
    place: "hat",
    layer: "front",
    opening: 12,
    fit: 0.95,
    height: 8.5,
    art: (
      <>
        <path
          className="bot-acc-gold"
          data-soft=""
          d="M-6 0L-6.6 -6.2L-3 -3.2L0 -7.4L3 -3.2L6.6 -6.2L6 0Q0 1.2 -6 0Z"
        />
        <circle className="bot-acc-gold" cx={-6.6} cy={-6.2} r={1.1} />
        <circle className="bot-acc-gold" cx={0} cy={-7.4} r={1.1} />
        <circle className="bot-acc-gold" cx={6.6} cy={-6.2} r={1.1} />
        <circle className="bot-acc-shade" cx={0} cy={-2} r={1.1} />
      </>
    ),
  },
  beanie: {
    place: "cap",
    layer: "front",
    cuff: { above: 1.6, below: 1.6 },
    pompom: { radius: 2.2, lift: 1.8 },
  },
  bow: {
    place: "top",
    layer: "front",
    scale: 1.2,
    height: 6,
    tilt: 1,
    art: (
      <>
        <path
          className="bot-acc-shade"
          d="M0 -1.5C-1.5 -5.5 -6.5 -6.2 -6.6 -2.4C-6.7 1.4 -1.8 1.6 0 -1.5Z"
        />
        <path
          className="bot-acc-shade"
          d="M0 -1.5C1.5 -5.5 6.5 -6.2 6.6 -2.4C6.7 1.4 1.8 1.6 0 -1.5Z"
        />
        <circle className="bot-acc-knot" cx={0} cy={-1.5} r={1.9} />
      </>
    ),
  },
  sprout: {
    place: "top",
    layer: "back",
    scale: 1.1,
    height: 11.6,
    tilt: 1,
    art: (
      <>
        <path className="bot-acc-stem" d="M0 2C0 -1.5 -0.3 -4 0 -6.5" />
        <path
          className="bot-acc-leaf"
          d="M0 -6.5C-0.8 -9.6 -4.6 -10.6 -6.2 -8.8C-4.8 -6.6 -1.8 -5.8 0 -6.5Z"
        />
        <path
          className="bot-acc-leaf"
          d="M0 -6.5C0.6 -10.4 4.2 -12 6.2 -10.6C5.2 -8 2.2 -6.6 0 -6.5Z"
        />
      </>
    ),
  },
  "round-glasses": {
    place: "face",
    layer: "face",
    art: (
      <>
        {TEMPLES}
        {BRIDGE}
        {pair(() => (
          <circle className="bot-acc-lens" r={LENS_RADIUS} />
        ))}
      </>
    ),
  },
  "square-glasses": {
    place: "face",
    layer: "face",
    art: (
      <>
        {pair(() => (
          <rect className="bot-acc-lens" x={-3.45} y={-3.6} width={6.9} height={7.2} rx={1.4} />
        ))}
      </>
    ),
  },
  sunglasses: {
    place: "face",
    layer: "face",
    art: (
      <path
        className="bot-acc-tint"
        d="M-7.6 -3.2H7.6Q7.8 -3.2 7.7 -2.6L7.3 0.6Q6.9 3.2 4.2 3.2H3.3Q0.9 3.2 0.6 0.4L0.4 -1.6H-0.4L-0.6 0.4Q-0.9 3.2 -3.3 3.2H-4.2Q-6.9 3.2 -7.3 0.6L-7.7 -2.6Q-7.8 -3.2 -7.6 -3.2Z"
      />
    ),
  },
  "heart-glasses": {
    place: "face",
    layer: "face",
    art: (
      <>
        {pair(() => (
          <path
            className="bot-acc-heart-lens"
            d="M0 3.2C-2.2 1.8 -3.6 0.4 -3.6 -1.1A1.9 1.9 0 0 1 0 -2.1A1.9 1.9 0 0 1 3.6 -1.1C3.6 0.4 2.2 1.8 0 3.2Z"
          />
        ))}
      </>
    ),
  },
  "reading-glasses": {
    place: "face",
    layer: "face",
    art: (
      <>
        {pair(() => (
          <path className="bot-acc-lens" d="M-3.5 0.6H3.5Q3.5 4 0 4Q-3.5 4 -3.5 0.6Z" />
        ))}
      </>
    ),
  },
  monocle: {
    place: "face",
    layer: "face",
    art: (
      <>
        <path className="bot-acc-chain" d="M6.3 2.6Q7.9 6.2 5.9 9" />
        <circle className="bot-acc-lens" cx={LENS_X} cy={0} r={LENS_RADIUS} data-gold="" />
      </>
    ),
  },
  antenna: {
    place: "top",
    layer: "back",
    scale: 1.1,
    height: 10.4,
    tilt: 1,
    art: (
      <>
        <path className="bot-acc-wire" d="M0 2V-6.5" />
        <circle className="bot-acc-gold" cx={0} cy={-8.3} r={2.1} />
      </>
    ),
  },
};

interface Pin {
  anchor: Anchor;
  mirror: boolean;
}

function pins(art: PinnedArt, geometry: ShapeGeometry): Pin[] {
  if (art.place === "top") return [{ anchor: geometry.top, mirror: false }];
  return [
    { anchor: geometry.ears[0], mirror: false },
    { anchor: geometry.ears[1], mirror: true },
  ];
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function hatScale(art: HatArt, geometry: ShapeGeometry): number {
  return (geometry.hat.width * art.fit) / art.opening;
}

function pompomCenter(art: CapArt, { top }: ShapeGeometry) {
  const angle = radians(top.angle);
  return {
    x: top.x + Math.sin(angle) * art.pompom.lift,
    y: top.y - Math.cos(angle) * art.pompom.lift,
  };
}

function Pinned({ art, geometry }: { art: PinnedArt; geometry: ShapeGeometry }) {
  return pins(art, geometry).map(({ anchor, mirror }, index) => (
    <g
      key={index}
      transform={`translate(${anchor.x} ${anchor.y}) rotate(${anchor.angle * art.tilt}) scale(${mirror ? -art.scale : art.scale} ${art.scale})`}
    >
      {art.art}
    </g>
  ));
}

function Hat({ art, geometry }: { art: HatArt; geometry: ShapeGeometry }) {
  const { x, y, angle } = geometry.hat;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${hatScale(art, geometry)})`}>
      {art.art}
    </g>
  );
}

function Cap({ art, geometry }: { art: CapArt; geometry: ShapeGeometry }) {
  const id = useId();
  const { brow, body } = geometry;
  const pompom = pompomCenter(art, geometry);
  const span = BOT_VIEWBOX * 2;
  return (
    <>
      <mask
        id={id}
        style={{ maskType: "alpha" }}
        maskUnits="userSpaceOnUse"
        x={-span}
        y={-span}
        width={span * 2}
        height={span * 2}
      >
        <g className="bot-cap-outline">{body}</g>
      </mask>
      <g mask={`url(#${id})`}>
        <g transform={`translate(${brow.x} ${brow.y}) rotate(${brow.angle})`}>
          <rect className="bot-acc-shade" x={-span / 2} y={-span} width={span} height={span} />
          <rect
            className="bot-acc-cream"
            x={-span / 2}
            y={-art.cuff.above}
            width={span}
            height={art.cuff.above + art.cuff.below}
          />
        </g>
      </g>
      <circle className="bot-acc-cream" cx={pompom.x} cy={pompom.y} r={art.pompom.radius} />
    </>
  );
}

export function BotAccessoryLayer({
  accessory,
  shape,
  layer,
}: {
  accessory: BotAccessory;
  shape: BotShape;
  layer: Layer;
}) {
  if (accessory === "none" || ACCESSORIES[accessory].layer !== layer) return null;
  const art = ACCESSORIES[accessory];
  const geometry = shapeGeometry(shape);
  return (
    <g className="bot-accessory">
      {art.place === "face" ? (
        art.art
      ) : art.place === "hat" ? (
        <Hat art={art} geometry={geometry} />
      ) : art.place === "cap" ? (
        <Cap art={art} geometry={geometry} />
      ) : (
        <Pinned art={art} geometry={geometry} />
      )}
    </g>
  );
}

function highestPoint(art: Exclude<AccessoryArt, FaceArt>, geometry: ShapeGeometry): number {
  if (art.place === "cap") return pompomCenter(art, geometry).y - art.pompom.radius;
  if (art.place === "hat")
    return (
      geometry.hat.y - art.height * hatScale(art, geometry) * Math.cos(radians(geometry.hat.angle))
    );
  return Math.min(
    ...pins(art, geometry).map(
      ({ anchor }) =>
        anchor.y - art.height * art.scale * Math.cos(radians(anchor.angle * art.tilt)),
    ),
  );
}

export function accessoryHeadroom(accessory: BotAccessory, shape: BotShape): number {
  if (accessory === "none") return 0;
  const art = ACCESSORIES[accessory];
  if (art.place === "face") return 0;
  return Math.max(0, HEADROOM_MARGIN - highestPoint(art, shapeGeometry(shape)));
}
