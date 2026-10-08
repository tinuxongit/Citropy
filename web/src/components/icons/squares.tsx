import type { ReactNode } from "react";
import { Icon, Knockout, LINE, Line, Turn, type IconProps } from "./kit.tsx";

const TILE = { x: 2.5, y: 2.5, width: 19, height: 19, rx: 4.5 };
const OUTLINE = { x: 3.75, y: 3.75, width: 16.5, height: 16.5, rx: 3.5 };
const DASH = "3.6 2.9";
const STOP = { x: 5, y: 5, width: 14, height: 14, rx: 3 };
const SCREEN = { x: 2, y: 3.5, width: 20, height: 17, rx: 4 };
const GLYPH_WIDTH = 2;
const PLUS = "M12 8V16M8 12H16";
const MENU = "M7.5 8.5H16.5M7.5 12H16.5M7.5 15.5H13";
const ROW_CUTS = "M0 8.75H24M0 15.25H24";
const GRID_CUTS = "M8.75 0V24M15.25 0V24M0 8.75H24M0 15.25H24";
const DIVIDER_WIDTH = 1.5;
const PANEL_CONTENT = { x: 9.5, y: 6, width: 10, height: 12, rx: 1.75 };
const PROMPT = "M6.5 9L9.5 12L6.5 15M12.5 15.5H17.5";

function Tile({ cuts, ...props }: IconProps & { cuts: ReactNode }) {
  return <Icon {...props}><Knockout cuts={cuts}><rect {...TILE} /></Knockout></Icon>;
}

export function StopIcon(props: IconProps) {
  return <Icon {...props}><rect {...STOP} /></Icon>;
}

export function SquareIcon(props: IconProps) {
  return <Icon {...props}><rect {...OUTLINE} fill="none" stroke="currentColor" strokeWidth={LINE} /></Icon>;
}

export function SquareDashedIcon(props: IconProps) {
  return <Icon {...props}><rect {...OUTLINE} fill="none" stroke="currentColor" strokeWidth={LINE} strokeDasharray={DASH} strokeLinecap="round" /></Icon>;
}

export function SquarePlusIcon(props: IconProps) {
  return <Tile {...props} cuts={<Line d={PLUS} width={GLYPH_WIDTH} />} />;
}

export function SquareMenuIcon(props: IconProps) {
  return <Tile {...props} cuts={<Line d={MENU} width={GLYPH_WIDTH} />} />;
}

export function RowsIcon(props: IconProps) {
  return <Tile {...props} cuts={<path d={ROW_CUTS} stroke="currentColor" strokeWidth={DIVIDER_WIDTH} />} />;
}

export function GridIcon(props: IconProps) {
  return <Tile {...props} cuts={<path d={GRID_CUTS} stroke="currentColor" strokeWidth={DIVIDER_WIDTH} />} />;
}

export function PanelLeftIcon(props: IconProps) {
  return <Icon {...props}><Knockout cuts={<rect {...PANEL_CONTENT} />}><rect {...SCREEN} /></Knockout></Icon>;
}

export function PanelRightIcon(props: IconProps) {
  return <Icon {...props}><Turn mirror><Knockout cuts={<rect {...PANEL_CONTENT} />}><rect {...SCREEN} /></Knockout></Turn></Icon>;
}

export function TerminalIcon(props: IconProps) {
  return <Icon {...props}><Knockout cuts={<Line d={PROMPT} width={GLYPH_WIDTH} />}><rect {...SCREEN} /></Knockout></Icon>;
}
