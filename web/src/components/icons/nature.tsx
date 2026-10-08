import { GAP, Icon, Knockout, LINE, Line, type IconProps } from "./kit.tsx";

const CENTER = 12;
const DROPLET = "M12 2.5C12 2.5 5 9.5 5 14.5A7 7 0 0 0 19 14.5C19 9.5 12 2.5 12 2.5Z";
const FLAME = "M12 2C12.75 5.5 16.25 7.5 17.75 10.75C19.75 15 17.5 22 12 22C6.5 22 4.25 17 6.5 12.5C7 14.25 8.25 15.25 9.5 15.25C8.25 11 10 5.5 12 2Z";
const LEAF = "M20.5 3.5C11 3.5 4.75 7.75 4.75 14.5C4.75 16.75 5.5 18.5 7 19.75C13.75 19.75 20.5 15 20.5 3.5Z";
const LEAF_VEIN = "M3 21.25C7 15.75 11 12 15.5 9.25";
const WAVE = "M2.5 0C4.5 0 5.25 -1.5 7.25 -1.5S10 0 12 0S14.75 -1.5 16.75 -1.5S19.5 0 21.5 0";
const WAVE_ROWS = [7, 12.5, 18];
const MOON = "M20.5 14.25A8.75 8.75 0 1 1 9.75 3.5A7 7 0 0 0 20.5 14.25Z";
const SUN = { core: 4.5, rayFrom: 7.75, rayTo: 9.75, rays: 8 };
const CHERRIES = [{ cx: 7, cy: 17.25, r: 4.25 }, { cx: 17, cy: 15.75, r: 4.25 }];
const CHERRY_STEMS = "M7 13C8 8.5 11 5 15.25 3M17 11.5C16.75 8.25 16.25 5.5 15.25 3";
const CITRUS = { rind: 10, flesh: 7.75, pith: 1.5, segments: 6 };
const FLOWER = { petals: 5, distance: 5.5, petal: 4, heart: 2.5 };

function polar(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) };
}

function spokes(count: number, from: number, to: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (360 / count) * index - 90;
    const start = polar(angle, from);
    const end = polar(angle, to);
    return `M${start.x} ${start.y}L${end.x} ${end.y}`;
  }).join("");
}

export function DropletIcon(props: IconProps) {
  return <Icon {...props}><path d={DROPLET} /></Icon>;
}

export function FlameIcon(props: IconProps) {
  return <Icon {...props}><path d={FLAME} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" /></Icon>;
}

export function LeafIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={LEAF_VEIN} width={GAP} />}><path d={LEAF} /></Knockout>
      <Line d="M3 21.25L6.25 17" />
    </Icon>
  );
}

export function WavesIcon(props: IconProps) {
  return <Icon {...props}>{WAVE_ROWS.map((y) => <Line key={y} d={WAVE} transform={`translate(0 ${y})`} />)}</Icon>;
}

export function MoonIcon(props: IconProps) {
  return <Icon {...props}><path d={MOON} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" /></Icon>;
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx={CENTER} cy={CENTER} r={SUN.core} />
      <Line d={spokes(SUN.rays, SUN.rayFrom, SUN.rayTo)} width={LINE} />
    </Icon>
  );
}

export function CherryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={CHERRY_STEMS} width={2} />
      {CHERRIES.map((cherry) => <circle key={cherry.cx} {...cherry} />)}
    </Icon>
  );
}

export function CitrusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><circle cx={CENTER} cy={CENTER} r={CITRUS.flesh} fill="none" stroke="currentColor" strokeWidth={GAP} /><Line d={spokes(CITRUS.segments, CITRUS.pith, CITRUS.flesh)} width={GAP} /></>}>
        <circle cx={CENTER} cy={CENTER} r={CITRUS.rind} />
      </Knockout>
    </Icon>
  );
}

export function FlowerIcon(props: IconProps) {
  const petals = Array.from({ length: FLOWER.petals }, (_, index) => polar((360 / FLOWER.petals) * index - 90, FLOWER.distance));
  return (
    <Icon {...props}>
      <Knockout cuts={<circle cx={CENTER} cy={CENTER} r={FLOWER.heart + GAP} />}>
        {petals.map(({ x, y }) => <circle key={`${x}:${y}`} cx={x} cy={y} r={FLOWER.petal} />)}
      </Knockout>
      <circle cx={CENTER} cy={CENTER} r={FLOWER.heart} />
    </Icon>
  );
}
