import { useId } from "react";

const BACK = "M2 6a3 3 0 0 1 3-3h4.17a2 2 0 0 1 1.42.59L12.5 5.5H19a3 3 0 0 1 3 3v9a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 17.5z";
const GAP = 1.5;
const CLOSED_FRONT = { x: 2, y: 9, width: 20, height: 12, rx: 3.5 };
const OPEN_FRONT = "M2 12.5h20v5a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 17.5z";
const SHEET = { x: 7, y: 5, width: 10, height: 10, rx: 1.5 };

type FolderIconProps = { size?: number; className?: string };
type Box = typeof SHEET;

function grown({ x, y, width, height, rx }: Box) {
  return { x: x - GAP, y: y - GAP, width: width + 2 * GAP, height: height + 2 * GAP, rx: rx + GAP };
}

function Cutout({ id, boxes = [], front }: { id: string; boxes?: Box[]; front?: string }) {
  return (
    <mask id={id}>
      <rect width="24" height="24" fill="white" />
      {boxes.map((box, index) => <rect key={index} {...grown(box)} fill="black" />)}
      {front && <path d={front} fill="black" stroke="black" strokeWidth={2 * GAP} strokeLinejoin="round" />}
    </mask>
  );
}

function iconClass(className?: string) {
  return className ? `solid-icon ${className}` : "solid-icon";
}

export function FolderIcon({ size = 24, className }: FolderIconProps) {
  const id = useId();
  return (
    <svg className={iconClass(className)} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs><Cutout id={id} boxes={[CLOSED_FRONT]} /></defs>
      <path d={BACK} mask={`url(#${id})`} />
      <rect {...CLOSED_FRONT} />
    </svg>
  );
}

export function FolderOpenIcon({ size = 24, className }: FolderIconProps) {
  const id = useId();
  return (
    <svg className={iconClass(className)} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <Cutout id={`${id}-back`} boxes={[SHEET]} front={OPEN_FRONT} />
        <Cutout id={`${id}-sheet`} front={OPEN_FRONT} />
      </defs>
      <path d={BACK} mask={`url(#${id}-back)`} />
      <rect {...SHEET} mask={`url(#${id}-sheet)`} />
      <path d={OPEN_FRONT} />
    </svg>
  );
}
