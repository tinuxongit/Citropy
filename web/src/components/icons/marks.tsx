import { BOLD_LINE, Icon, Line, type IconProps } from "./kit.tsx";

const CHECK = "M4.5 12.75L9.5 17.75L19.5 6.75";
const DOUBLE_CHECK = "M1.75 12.75L6.25 17.25L16 6.75M12.25 16L13.5 17.25L23 7";
const CROSS = "M6 6L18 18M18 6L6 18";
const PLUS = "M12 4.5V19.5M4.5 12H19.5";
const MINUS = "M4.5 12H19.5";
const HASH = "M9.75 3.5L7.75 20.5M16.25 3.5L14.25 20.5M4 8.75H20.5M3.5 15.25H20";
const DOT_RADIUS = 2.25;
const ROW_DOTS = [5, 12, 19];
const GRID_DOT_RADIUS = 1.9;
const GRID_DOTS = [5.5, 12, 18.5];

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><Line d={CHECK} width={BOLD_LINE} /></Icon>;
}

export function CheckCheckIcon(props: IconProps) {
  return <Icon {...props}><Line d={DOUBLE_CHECK} width={BOLD_LINE} /></Icon>;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props}><Line d={CROSS} width={BOLD_LINE} /></Icon>;
}

export function PlusIcon(props: IconProps) {
  return <Icon {...props}><Line d={PLUS} width={BOLD_LINE} /></Icon>;
}

export function MinusIcon(props: IconProps) {
  return <Icon {...props}><Line d={MINUS} width={BOLD_LINE} /></Icon>;
}

export function HashIcon(props: IconProps) {
  return <Icon {...props}><Line d={HASH} /></Icon>;
}

export function MoreIcon(props: IconProps) {
  return <Icon {...props}>{ROW_DOTS.map((x) => <circle key={x} cx={x} cy={12} r={DOT_RADIUS} />)}</Icon>;
}

export function GripIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {GRID_DOTS.flatMap((y) => GRID_DOTS.map((x) => <circle key={`${x}:${y}`} cx={x} cy={y} r={GRID_DOT_RADIUS} />))}
    </Icon>
  );
}
