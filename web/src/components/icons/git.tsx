import type { ReactNode } from "react";
import { BOLD_LINE, Icon, Knockout, Line, Turn, type IconProps } from "./kit.tsx";

const NODE_RADIUS = 3;
const NODE_GAP = 1.25;
const BRANCH = { nodes: [{ x: 6.5, y: 5 }, { x: 6.5, y: 19 }, { x: 17.5, y: 5 }], lines: "M6.5 5V19M17.5 5C17.5 12.5 6.5 10.5 6.5 16" };
const PULL_REQUEST = { nodes: [{ x: 6, y: 5 }, { x: 6, y: 19 }, { x: 18, y: 19 }], lines: "M6 5V19M18 19V10.5A3.5 3.5 0 0 0 14.5 7H10.5" };
const PULL_REQUEST_ARROW = "M13 3.5L9.5 7L13 10.5Z";
const MERGE = { nodes: [{ x: 6.5, y: 5 }, { x: 6.5, y: 19 }, { x: 17.5, y: 15 }], lines: "M6.5 5V19M6.5 7.5C6.5 12 10.5 15 17.5 15" };
const FORK = { nodes: [{ x: 6.5, y: 5 }, { x: 17.5, y: 5 }, { x: 12, y: 19 }], lines: "M6.5 5V7.5A3 3 0 0 0 9.5 10.5H14.5A3 3 0 0 0 17.5 7.5V5M12 10.5V19" };
const NEW_BRANCH = { nodes: [{ x: 6.5, y: 5 }, { x: 6.5, y: 19 }], lines: "M6.5 5V19M17.5 10.5C17.5 14 6.5 12.5 6.5 16" };
const NEW_BRANCH_PLUS = "M17.5 2.25V8.25M14.5 5.25H20.5";
const COMMIT = { nodes: [{ x: 12, y: 12 }], lines: "M2.5 12H21.5" };
const COMMIT_NODE_RADIUS = 4;

type Graph = { nodes: Array<{ x: number; y: number }>; lines: string };

function GitGraph({ graph, radius = NODE_RADIUS, children }: { graph: Graph; radius?: number; children?: ReactNode }) {
  return (
    <>
      <Knockout cuts={graph.nodes.map(({ x, y }) => <circle key={`${x}:${y}`} cx={x} cy={y} r={radius + NODE_GAP} />)}>
        <Line d={graph.lines} />
      </Knockout>
      {graph.nodes.map(({ x, y }) => <circle key={`${x}:${y}`} cx={x} cy={y} r={radius} />)}
      {children}
    </>
  );
}

export function BranchIcon(props: IconProps) {
  return <Icon {...props}><GitGraph graph={BRANCH} /></Icon>;
}

export function PullRequestIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <GitGraph graph={PULL_REQUEST}>
        <path d={PULL_REQUEST_ARROW} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      </GitGraph>
    </Icon>
  );
}

export function MergeIcon(props: IconProps) {
  return <Icon {...props}><GitGraph graph={MERGE} /></Icon>;
}

export function ForkIcon(props: IconProps) {
  return <Icon {...props}><GitGraph graph={FORK} /></Icon>;
}

export function NewBranchIcon(props: IconProps) {
  return <Icon {...props}><GitGraph graph={NEW_BRANCH}><Line d={NEW_BRANCH_PLUS} width={BOLD_LINE} /></GitGraph></Icon>;
}

export function CommitIcon(props: IconProps) {
  return <Icon {...props}><GitGraph graph={COMMIT} radius={COMMIT_NODE_RADIUS} /></Icon>;
}

export function CommitVerticalIcon(props: IconProps) {
  return <Icon {...props}><Turn degrees={90}><GitGraph graph={COMMIT} radius={COMMIT_NODE_RADIUS} /></Turn></Icon>;
}
