import { CUT, Icon, Knockout, LINE, Line, Turn, type IconProps } from "./kit.tsx";

const CENTER = 12;
const HEAD = { length: 4, width: 6, rounding: 1.25 };
const TURN_RADIUS = 8.5;
const TURN_ARC = { tail: -115, head: 205 };
const REFRESH_RADIUS = 8.25;
const REFRESH_ARCS = [{ tail: 165, head: 35 }, { tail: -15, head: -145 }];
const HISTORY_RADIUS = 9.25;
const HISTORY_LINE = 2.25;
const HISTORY_FACE = 5.75;
const HISTORY_HANDS = "M12 9V12L14 13.25";
const ROTATE_RADIUS = 8.5;
const ROTATE_ARCS = [{ tail: 180, head: 122 }, { tail: 0, head: -58 }];
const ROTATE_LINE = 2;
const ROTATE_PHONE = { x: 9, y: 5.75, width: 6, height: 12.5, rx: 1.75 };
const ROTATE_TILT = 45;
const UNDO = "M9 14L4 9L9 4M4 9H14.5A5.5 5.5 0 0 1 14.5 20H11";

type Arc = { tail: number; head: number };

function point(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER - radius * Math.sin(radians) };
}

function arcPath({ tail, head }: Arc, radius: number) {
  const start = point(tail, radius);
  const end = point(head, radius);
  const clockwise = head < tail;
  const large = Math.abs(head - tail) > 180 ? 1 : 0;
  return `M${start.x} ${start.y}A${radius} ${radius} 0 ${large} ${clockwise ? 1 : 0} ${end.x} ${end.y}`;
}

function headPath({ tail, head }: Arc, radius: number) {
  const radians = (head * Math.PI) / 180;
  const sign = head < tail ? 1 : -1;
  const along = { x: sign * Math.sin(radians), y: sign * Math.cos(radians) };
  const outward = { x: Math.cos(radians), y: -Math.sin(radians) };
  const base = point(head, radius);
  const tip = { x: base.x + along.x * HEAD.length, y: base.y + along.y * HEAD.length };
  const inner = { x: base.x - outward.x * HEAD.width / 2, y: base.y - outward.y * HEAD.width / 2 };
  const outer = { x: base.x + outward.x * HEAD.width / 2, y: base.y + outward.y * HEAD.width / 2 };
  return `M${tip.x} ${tip.y}L${inner.x} ${inner.y}L${outer.x} ${outer.y}Z`;
}

function ArcArrow({ arc, radius, width = LINE }: { arc: Arc; radius: number; width?: number }) {
  return (
    <>
      <Line d={arcPath(arc, radius)} width={width} />
      <path d={headPath(arc, radius)} stroke="currentColor" strokeWidth={HEAD.rounding} strokeLinejoin="round" />
    </>
  );
}

export function RefreshIcon(props: IconProps) {
  return <Icon {...props}>{REFRESH_ARCS.map((arc) => <ArcArrow key={arc.tail} arc={arc} radius={REFRESH_RADIUS} />)}</Icon>;
}

export function RotateCcwIcon(props: IconProps) {
  return <Icon {...props}><ArcArrow arc={TURN_ARC} radius={TURN_RADIUS} /></Icon>;
}

export function RotateCwIcon(props: IconProps) {
  return <Icon {...props}><Turn mirror><ArcArrow arc={TURN_ARC} radius={TURN_RADIUS} /></Turn></Icon>;
}

export function UndoIcon(props: IconProps) {
  return <Icon {...props}><Line d={UNDO} /></Icon>;
}

export function RedoIcon(props: IconProps) {
  return <Icon {...props}><Turn mirror><Line d={UNDO} /></Turn></Icon>;
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ArcArrow arc={TURN_ARC} radius={HISTORY_RADIUS} width={HISTORY_LINE} />
      <Knockout cuts={<Line d={HISTORY_HANDS} width={CUT} />}>
        <circle cx={CENTER} cy={CENTER} r={HISTORY_FACE} />
      </Knockout>
    </Icon>
  );
}

export function RotatePhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Turn degrees={ROTATE_TILT}><rect {...ROTATE_PHONE} /></Turn>
      {ROTATE_ARCS.map((arc) => <ArcArrow key={arc.tail} arc={arc} radius={ROTATE_RADIUS} width={ROTATE_LINE} />)}
    </Icon>
  );
}
