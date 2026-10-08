import { CUT, GAP, Icon, Knockout, LINE, Line, type IconProps } from "./kit.tsx";

const CENTER = 12;
const ROUNDING = 1.5;
const BULB = "M12 2A7 7 0 0 0 7.5 14.4C8.4 15.2 9 16 9 17H15C15 16 15.6 15.2 16.5 14.4A7 7 0 0 0 12 2Z";
const BULB_BASE = "M9.75 20H14.25";
const BUG = { body: { cx: 12, cy: 15, rx: 5.5, ry: 6.5 }, head: "M8.25 7A3.75 3.75 0 0 1 15.75 7Z", seam: "M12 9V22", legs: "M2.75 9.75L5.25 11.25M21.25 9.75L18.75 11.25M2.25 15H5M21.75 15H19M2.75 20.25L5.5 18.5M21.25 20.25L18.5 18.5" };
const TARGET = { ring: 8.75, bull: 4.25 };
const WRENCH = "M14.7 6.3A1 1 0 0 0 14.7 7.7L16.3 9.3A1 1 0 0 0 17.7 9.3L21.47 5.53A6 6 0 0 1 13.53 13.47L6.62 20.38A2.12 2.12 0 0 1 3.62 17.38L10.53 10.47A6 6 0 0 1 18.47 2.53Z";
const COOKIE = { radius: 10, bite: { cx: 20.5, cy: 3.5, r: 5 }, chips: [{ cx: 8, cy: 9, r: 1.5 }, { cx: 13.5, cy: 12.5, r: 1.5 }, { cx: 8.5, cy: 15.75, r: 1.5 }, { cx: 15.5, cy: 17.5, r: 1.25 }] };
const BOARD = { x: 2, y: 3, width: 20, height: 13, rx: 2.5 };
const BOARD_STAND = "M12 16V21.5M8.5 21.5H15.5";
const BOARD_CHART = "M6 12.5L9.5 9L12.5 11.5L17.5 6.5";
const ATOM_ORBIT = { rx: 10, ry: 4 };
const ATOM_TILTS = [0, 60, 120];
const ATOM_LINE = 1.75;
const ATOM_NUCLEUS = 2.25;
const FLASK = "M10 3H14V8.75L19.6 18.6A1.9 1.9 0 0 1 17.95 21.5H6.05A1.9 1.9 0 0 1 4.4 18.6L10 8.75Z";
const FLASK_LIP = "M8.5 2.75H15.5";
const FLASK_LEVEL = "M0 14.25H24";
const BRAIN_LOBES = [{ cx: 8, cy: 7, r: 4 }, { cx: 5.5, cy: 12, r: 4 }, { cx: 8, cy: 17, r: 4 }, { cx: 16, cy: 7, r: 4 }, { cx: 18.5, cy: 12, r: 4 }, { cx: 16, cy: 17, r: 4 }];
const BRAIN_CORE = { x: 8, y: 4, width: 8, height: 16 };
const BRAIN_FOLDS = "M12 1V23M7.5 10.5C9 10.5 10 11.5 10 13M16.5 10.5C15 10.5 14 11.5 14 13";

export function LightbulbIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d={BULB} />
      <Line d={BULB_BASE} width={LINE} />
    </Icon>
  );
}

export function BugIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={BUG.seam} width={GAP} />}><ellipse {...BUG.body} /></Knockout>
      <path d={BUG.head} />
      <Line d={BUG.legs} width={2} />
    </Icon>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx={CENTER} cy={CENTER} r={TARGET.ring} fill="none" stroke="currentColor" strokeWidth={LINE} />
      <circle cx={CENTER} cy={CENTER} r={TARGET.bull} />
    </Icon>
  );
}

export function WrenchIcon(props: IconProps) {
  return <Icon {...props}><path d={WRENCH} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Icon>;
}

export function CookieIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><circle {...COOKIE.bite} />{COOKIE.chips.map((chip) => <circle key={`${chip.cx}:${chip.cy}`} {...chip} />)}</>}>
        <circle cx={CENTER} cy={CENTER} r={COOKIE.radius} />
      </Knockout>
    </Icon>
  );
}

export function PresentationIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={BOARD_CHART} width={CUT} />}><rect {...BOARD} /></Knockout>
      <Line d={BOARD_STAND} />
    </Icon>
  );
}

export function AtomIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {ATOM_TILTS.map((degrees) => <ellipse key={degrees} cx={CENTER} cy={CENTER} {...ATOM_ORBIT} fill="none" stroke="currentColor" strokeWidth={ATOM_LINE} transform={`rotate(${degrees} ${CENTER} ${CENTER})`} />)}
      <circle cx={CENTER} cy={CENTER} r={ATOM_NUCLEUS} />
    </Icon>
  );
}

export function FlaskIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<path d={FLASK_LEVEL} stroke="currentColor" strokeWidth={GAP} />}>
        <path d={FLASK} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" />
      </Knockout>
      <Line d={FLASK_LIP} width={LINE} />
    </Icon>
  );
}

export function BrainIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={BRAIN_FOLDS} width={CUT} />}>
        {BRAIN_LOBES.map((lobe) => <circle key={`${lobe.cx}:${lobe.cy}`} {...lobe} />)}
        <rect {...BRAIN_CORE} />
      </Knockout>
    </Icon>
  );
}
