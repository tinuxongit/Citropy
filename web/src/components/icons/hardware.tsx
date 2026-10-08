import { CUT, GAP, Icon, Knockout, LINE, Line, Turn, type IconProps } from "./kit.tsx";

const ROUNDING = 1.5;
const MONITOR = { screen: { x: 2, y: 3, width: 20, height: 13.5, rx: 3.5 }, neck: { x: 10.75, y: 16, width: 2.5, height: 4 }, foot: "M8 20.5H16" };
const TABLET = { x: 3.5, y: 2, width: 17, height: 20, rx: 3.5 };
const HOME_BAR = "M10 18.5H14";
const CHIP = { x: 5.5, y: 5.5, width: 13, height: 13, rx: 2.5 };
const CORE = { x: 9.25, y: 9.25, width: 5.5, height: 5.5, rx: 1 };
const CHIP_PINS = "M9.5 2V3M14.5 2V3M9.5 21V22M14.5 21V22M2 9.5H3M2 14.5H3M21 9.5H22M21 14.5H22";
const CHIP_PIN_WIDTH = 2.25;
const STICK = { x: 2, y: 4.5, width: 20, height: 11, rx: 2.5 };
const STICK_CHIPS = [5, 10.25, 15.5].map((x) => ({ x, y: 7.75, width: 3.5, height: 4.5, rx: 0.75 }));
const STICK_PINS = "M5.5 18.5V20.5M9.5 18.5V20.5M14.5 18.5V20.5M18.5 18.5V20.5";
const CYLINDER = "M3.5 5.5A8.5 3.25 0 0 1 20.5 5.5V18.5A8.5 3.25 0 0 1 3.5 18.5Z";
const CYLINDER_BANDS = "M3.5 5.5A8.5 3.25 0 0 0 20.5 5.5M3.5 12A8.5 3.25 0 0 0 20.5 12";
const CUBE = "M12 2.25L20.75 7.1V16.9L12 21.75L3.25 16.9V7.1Z";
const CUBE_EDGES = "M3.25 7.1L12 12L20.75 7.1M12 12V22";
const PACKAGE_STRAP = "M7.6 4.7L16.4 9.6";
const NETWORK = { nodes: [{ x: 9, y: 2 }, { x: 2.5, y: 16 }, { x: 15.5, y: 16 }], links: "M12 8V12M5.5 16V12H18.5V16" };
const NETWORK_NODE = { width: 6, height: 6, rx: 1.75 };
const PLUG = { prongs: "M9 2.5V7.5M15 2.5V7.5", body: "M5.5 8.5H18.5V11A6.5 6.5 0 0 1 5.5 11Z", cord: "M12 17.5V21.5" };
const UNPLUGGED_TILT = 45;
const POWER = { ring: "M7.13 5.04A8.5 8.5 0 1 0 16.87 5.04", stem: "M12 2.5V11" };

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...MONITOR.screen} />
      <rect {...MONITOR.neck} />
      <Line d={MONITOR.foot} width={LINE} />
    </Icon>
  );
}

export function TabletIcon(props: IconProps) {
  return <Icon {...props}><Knockout cuts={<Line d={HOME_BAR} width={CUT} />}><rect {...TABLET} /></Knockout></Icon>;
}

export function CpuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<rect {...CORE} fill="none" stroke="currentColor" strokeWidth={GAP} />}><rect {...CHIP} /></Knockout>
      <Line d={CHIP_PINS} width={CHIP_PIN_WIDTH} />
    </Icon>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={STICK_CHIPS.map((chip) => <rect key={chip.x} {...chip} />)}><rect {...STICK} /></Knockout>
      <Line d={STICK_PINS} width={2} />
    </Icon>
  );
}

export function DatabaseIcon(props: IconProps) {
  return <Icon {...props}><Knockout cuts={<Line d={CYLINDER_BANDS} width={GAP} />}><path d={CYLINDER} /></Knockout></Icon>;
}

export function BoxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={CUBE_EDGES} width={GAP} />}><path d={CUBE} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Knockout>
    </Icon>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={`${CUBE_EDGES}${PACKAGE_STRAP}`} width={GAP} />}><path d={CUBE} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Knockout>
    </Icon>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {NETWORK.nodes.map(({ x, y }) => <rect key={`${x}:${y}`} x={x} y={y} {...NETWORK_NODE} />)}
      <Line d={NETWORK.links} />
    </Icon>
  );
}

function Plug() {
  return (
    <>
      <Line d={PLUG.prongs} />
      <path d={PLUG.body} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" />
      <Line d={PLUG.cord} />
    </>
  );
}

export function PlugIcon(props: IconProps) {
  return <Icon {...props}><Plug /></Icon>;
}

export function DisconnectedIcon(props: IconProps) {
  return <Icon {...props}><Turn degrees={UNPLUGGED_TILT}><Plug /></Turn></Icon>;
}

export function PowerIcon(props: IconProps) {
  return <Icon {...props}><Line d={`${POWER.ring}${POWER.stem}`} width={LINE + 0.25} /></Icon>;
}
