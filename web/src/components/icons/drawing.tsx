import { BOLD_LINE, GAP, Icon, Knockout, Line, type IconProps } from "./kit.tsx";

const ROUNDING = 2;
const POINTER = "M4.75 3.5L19.5 9.75L12.75 12.25L10.25 19Z";
const TILT = "rotate(-45 12 12)";
const HIGHLIGHTER = { body: { x: 10, y: 7.5, width: 12, height: 9, rx: 2 }, collar: { x: 6.75, y: 8.25, width: 2.5, height: 7.5, rx: 0.75 }, tip: "M6 9.5L3.25 10.5V13.5L6 14.5Z", shift: "translate(1.75 -1.75)" };
const INK = "M3.5 21.25H10.5";
const ERASER = { body: { x: 2.5, y: 7.25, width: 19, height: 9.5, rx: 2.5 }, joint: "M10 0V24", shift: "translate(0.5 -1.5)" };
const ERASER_BASE = "M12.5 21.25H20.5";
const BUCKET = "M19 11L11 3L2.6 11.4A2 2 0 0 0 2.6 14.2L7.8 19.4A2 2 0 0 0 10.6 19.4Z";
const BUCKET_HANDLE = "M5.5 2.5L9.25 6.25";
const DROP = "M22 19.5A2 2 0 1 1 18 19.5C18 18 19.6 17.2 20 15.5C20.4 17.2 22 18 22 19.5Z";
const PIPETTE = { tube: { x: 5, y: 9.75, width: 7.5, height: 4.5, rx: 1 }, collar: { x: 13.75, y: 6.5, width: 2.25, height: 11, rx: 1.1 }, bulb: { x: 17.25, y: 8.25, width: 5, height: 7.5, rx: 2.5 }, tip: "M5 10.5L2.25 12L5 13.5Z" };
const NIB = "M12 2.5L18.25 12.25L14.5 16.75H9.5L5.75 12.25Z";
const NIB_SLIT = "M12 3V9.5";
const NIB_HOLE = { cx: 12, cy: 11, r: 1.6 };
const NIB_BASE = { x: 8.75, y: 18.25, width: 6.5, height: 3.5, rx: 1 };
const DIAGONAL = "M5 19L19 5";

export function PointerIcon(props: IconProps) {
  return <Icon {...props}><path d={POINTER} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Icon>;
}

export function HighlighterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform={`${HIGHLIGHTER.shift} ${TILT}`}>
        <rect {...HIGHLIGHTER.body} />
        <rect {...HIGHLIGHTER.collar} />
        <path d={HIGHLIGHTER.tip} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      </g>
      <Line d={INK} />
    </Icon>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform={`${ERASER.shift} ${TILT}`}>
        <Knockout cuts={<path d={ERASER.joint} stroke="currentColor" strokeWidth={GAP} />}><rect {...ERASER.body} /></Knockout>
      </g>
      <Line d={ERASER_BASE} />
    </Icon>
  );
}

export function PaintBucketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={BUCKET_HANDLE} width={BOLD_LINE + 2 * GAP} />}>
        <path d={BUCKET} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" />
      </Knockout>
      <Line d={BUCKET_HANDLE} />
      <path d={DROP} />
    </Icon>
  );
}

export function PipetteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform={TILT}>
        <rect {...PIPETTE.tube} />
        <rect {...PIPETTE.collar} />
        <rect {...PIPETTE.bulb} />
        <path d={PIPETTE.tip} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      </g>
    </Icon>
  );
}

export function PenNibIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><Line d={NIB_SLIT} width={GAP} /><circle {...NIB_HOLE} /></>}>
        <path d={NIB} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" />
      </Knockout>
      <rect {...NIB_BASE} />
    </Icon>
  );
}

export function LineIcon(props: IconProps) {
  return <Icon {...props}><Line d={DIAGONAL} width={BOLD_LINE} /></Icon>;
}
