import { GAP, Icon, Knockout, type IconProps } from "./kit.tsx";

const HEAD = { cx: 12, cy: 7.5, r: 4.75 };
const SHOULDERS = "M4 21C4 16.6 7.6 13.75 12 13.75C16.4 13.75 20 16.6 20 21A1 1 0 0 1 19 22H5A1 1 0 0 1 4 21Z";
const FRONT = "translate(-3 0.5) scale(0.85) translate(2.1 2.1)";
const BACK = "translate(4.75 -1.5) scale(0.75) translate(4 4)";

function Person() {
  return (
    <>
      <circle {...HEAD} />
      <path d={SHOULDERS} />
    </>
  );
}

export function UserIcon(props: IconProps) {
  return <Icon {...props}><Person /></Icon>;
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<g transform={FRONT} stroke="currentColor" strokeWidth={(2 * GAP) / 0.85} strokeLinejoin="round"><Person /></g>}>
        <g transform={BACK}><Person /></g>
      </Knockout>
      <g transform={FRONT}><Person /></g>
    </Icon>
  );
}
