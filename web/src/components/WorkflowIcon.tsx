const BOXES = [{ x: 2, y: 2, width: 9, height: 9, rx: 2.75 }, { x: 13, y: 13, width: 9, height: 9, rx: 2.75 }];
const LINK = "M6.5 11V14A3.5 3.5 0 0 0 10 17.5H13";
const LINK_WIDTH = 2.25;

export function WorkflowIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {BOXES.map((box) => <rect key={box.x} {...box} />)}
      <path d={LINK} fill="none" stroke="currentColor" strokeWidth={LINK_WIDTH} />
    </svg>
  );
}
