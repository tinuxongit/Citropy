import type { ReactNode } from "react";
import { GAP, Icon, Knockout, LINE, Line, type IconProps } from "./kit.tsx";

const BACK = "M2 6a3 3 0 0 1 3-3h4.17a2 2 0 0 1 1.42.59L12.5 5.5H19a3 3 0 0 1 3 3v9a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 17.5z";
const CLOSED_FRONT = { x: 2, y: 9, width: 20, height: 12, rx: 3.5 };
const OPEN_FRONT = "M2 12.5h20v5a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 17.5z";
const SHEET = { x: 7, y: 5, width: 10, height: 10, rx: 1.5 };
const GLYPH_WIDTH = 2;
const PLUS = "M12 12V18M9 15H15";
const BRANCH = { line: "M9.5 12.5V18M14.5 12.5C14.5 15 9.5 14.5 9.5 16.5", nodes: [{ cx: 9.5, cy: 12.25 }, { cx: 9.5, cy: 18 }, { cx: 14.5, cy: 12.25 }] };
const BRANCH_NODE_RADIUS = 1.4;
const TREE_LINES = "M4 3V16.5A1.5 1.5 0 0 0 5.5 18H9.5M4 7.5H9.5";
const TREE_FOLDER = "M10 5.25A1.25 1.25 0 0 1 11.25 4H13.4a1 1 0 0 1 .7.3L15 5.25H20.75A1.25 1.25 0 0 1 22 6.5V9.75A1.25 1.25 0 0 1 20.75 11H11.25A1.25 1.25 0 0 1 10 9.75Z";
const TREE_SHIFT = 10.5;
const TREE_ROUNDING = 1;

function grown(box: typeof SHEET, grow: number) {
  return { x: box.x - grow, y: box.y - grow, width: box.width + 2 * grow, height: box.height + 2 * grow, rx: box.rx + grow };
}

function ClosedFolder({ glyph, ...props }: IconProps & { glyph?: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={<rect {...grown(CLOSED_FRONT, GAP)} />}><path d={BACK} /></Knockout>
      <Knockout cuts={glyph}><rect {...CLOSED_FRONT} /></Knockout>
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return <ClosedFolder {...props} />;
}

export function FolderOpenIcon(props: IconProps) {
  const front = <path d={OPEN_FRONT} stroke="currentColor" strokeWidth={2 * GAP} strokeLinejoin="round" />;
  return (
    <Icon {...props}>
      <Knockout cuts={<><rect {...grown(SHEET, GAP)} />{front}</>}><path d={BACK} /></Knockout>
      <Knockout cuts={front}><rect {...SHEET} /></Knockout>
      <path d={OPEN_FRONT} />
    </Icon>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return <ClosedFolder {...props} glyph={<Line d={PLUS} width={GLYPH_WIDTH} />} />;
}

export function FolderGitIcon(props: IconProps) {
  return (
    <ClosedFolder
      {...props}
      glyph={<><Line d={BRANCH.line} width={GLYPH_WIDTH - 0.5} />{BRANCH.nodes.map((node) => <circle key={`${node.cx}:${node.cy}`} {...node} r={BRANCH_NODE_RADIUS} />)}</>}
    />
  );
}

export function FolderTreeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={TREE_LINES} width={LINE - 0.5} />
      <path d={TREE_FOLDER} stroke="currentColor" strokeWidth={TREE_ROUNDING} strokeLinejoin="round" />
      <path d={TREE_FOLDER} transform={`translate(0 ${TREE_SHIFT})`} stroke="currentColor" strokeWidth={TREE_ROUNDING} strokeLinejoin="round" />
    </Icon>
  );
}
