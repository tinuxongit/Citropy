import { GAP, Icon, Knockout, type IconProps } from "./kit.tsx";

const BODY = { x: 7, y: 8.75, width: 11, height: 6.5, rx: 1.25 };
const ERASER = { x: 18, y: 8.75, width: 4, height: 6.5, rx: 2 };
const TIP = "M7 8.75L2 12L7 15.25Z";
const TIP_ROUNDING = 1;
const SILHOUETTE = "M2 12L7 8.75H20A2 2 0 0 1 22 10.75V13.25A2 2 0 0 1 20 15.25H7Z";
const JOINT_GAP = 1.25;
const EDIT = { x: 12, y: 12, degrees: -45, scale: 1 };
const COMPOSE = { x: 15.5, y: 8.5, degrees: -45, scale: 0.6 };
const COMPOSE_SHEET = { x: 2.5, y: 5, width: 16.5, height: 16.5, rx: 4 };
const NOTEBOOK = { x: 2.5, y: 2, width: 14, height: 20, rx: 3 };
const NOTEBOOK_SPINE_X = 6.5;
const NOTEBOOK_SPINE_WIDTH = 1.75;
const NOTEBOOK_PEN = { x: 18.75, y: 12.5, degrees: -90, scale: 0.68 };

type Placement = typeof EDIT;

function place({ x, y, degrees, scale }: Placement) {
  return `translate(${x} ${y}) rotate(${degrees}) scale(${scale}) translate(-12 -12)`;
}

function Pencil({ at }: { at: Placement }) {
  return (
    <g transform={place(at)}>
      <Knockout cuts={<path d={`M${BODY.x} 0V24M${ERASER.x} 0V24`} stroke="currentColor" strokeWidth={JOINT_GAP} />}>
        <rect {...BODY} />
        <rect {...ERASER} />
        <path d={TIP} stroke="currentColor" strokeWidth={TIP_ROUNDING} strokeLinejoin="round" />
      </Knockout>
    </g>
  );
}

function PencilGap({ at }: { at: Placement }) {
  return <path d={SILHOUETTE} transform={place(at)} stroke="currentColor" strokeWidth={(2 * GAP) / at.scale} strokeLinejoin="round" />;
}

export function EditIcon(props: IconProps) {
  return <Icon {...props}><Pencil at={EDIT} /></Icon>;
}

export function ComposeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<PencilGap at={COMPOSE} />}><rect {...COMPOSE_SHEET} /></Knockout>
      <Pencil at={COMPOSE} />
    </Icon>
  );
}

export function NotebookPenIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><PencilGap at={NOTEBOOK_PEN} /><path d={`M${NOTEBOOK_SPINE_X} 0V24`} stroke="currentColor" strokeWidth={NOTEBOOK_SPINE_WIDTH} /></>}>
        <rect {...NOTEBOOK} />
      </Knockout>
      <Pencil at={NOTEBOOK_PEN} />
    </Icon>
  );
}
