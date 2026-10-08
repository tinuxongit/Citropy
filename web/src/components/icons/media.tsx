import type { ReactNode } from "react";
import { BOLD_LINE, CUT, GAP, Icon, Knockout, LINE, Line, type IconProps } from "./kit.tsx";

const ROUNDING = 2.5;
const PLAY = "M7.5 4.75L19 12L7.5 19.25Z";
const PLAY_DISC = { cx: 12, cy: 12, r: 10 };
const PLAY_CUT = "M10 8.25L15.5 12L10 15.75Z";
const PAUSE_BARS = [5.5, 13.5];
const PAUSE_BAR = { y: 4, width: 5, height: 16, rx: 1.75 };
const SPEAKER = "M2.75 9.5A1.5 1.5 0 0 1 4.25 8H7.25L11.75 4V20L7.25 16H4.25A1.5 1.5 0 0 1 2.75 14.5Z";
const SPEAKER_ROUNDING = 1.5;
const WAVES = "M15.25 9A4.25 4.25 0 0 1 15.25 15M18 6A8.5 8.5 0 0 1 18 18";
const MUTE = "M15.25 9.5L20.25 14.5M20.25 9.5L15.25 14.5";
export const CORNERS_OUT = "M3.5 8.5V6A2.5 2.5 0 0 1 6 3.5H8.5M15.5 3.5H18A2.5 2.5 0 0 1 20.5 6V8.5M20.5 15.5V18A2.5 2.5 0 0 1 18 20.5H15.5M8.5 20.5H6A2.5 2.5 0 0 1 3.5 18V15.5";
const CORNERS_IN = "M8.5 3.5V6A2.5 2.5 0 0 1 6 8.5H3.5M20.5 8.5H18A2.5 2.5 0 0 1 15.5 6V3.5M15.5 20.5V18A2.5 2.5 0 0 1 18 15.5H20.5M3.5 15.5H6A2.5 2.5 0 0 1 8.5 18V20.5";
const EXPAND = "M14.5 3.5H20.5V9.5M20.5 3.5L14 10M9.5 20.5H3.5V14.5M3.5 20.5L10 14";
const COLLAPSE = "M4 14H10V20M10 14L3.5 20.5M20 10H14V4M14 10L20.5 3.5";
const PICTURE = { x: 2, y: 3.5, width: 20, height: 17, rx: 4 };
const PICTURE_SUN = { cx: 8, cy: 9, r: 2 };
const PICTURE_HILLS = "M2 19L8.75 12.75L13 16.75L15.75 14.25L22 20";
const BADGE = { cx: 18.5, cy: 5.5, r: 6 };
const BADGE_PLUS = "M18.5 2.5V8.5M15.5 5.5H21.5";
const SLASH = "M3 3L21 21";

function Picture({ cuts, children, ...props }: IconProps & { cuts?: ReactNode; children?: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><circle {...PICTURE_SUN} /><Line d={PICTURE_HILLS} width={CUT} />{cuts}</>}><rect {...PICTURE} /></Knockout>
      {children}
    </Icon>
  );
}

function Speaker({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <Icon {...props}>
      <path d={SPEAKER} stroke="currentColor" strokeWidth={SPEAKER_ROUNDING} strokeLinejoin="round" />
      {children}
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return <Icon {...props}><path d={PLAY} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Icon>;
}

export function PlayCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<path d={PLAY_CUT} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />}><circle {...PLAY_DISC} /></Knockout>
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return <Icon {...props}>{PAUSE_BARS.map((x) => <rect key={x} x={x} {...PAUSE_BAR} />)}</Icon>;
}

export function VolumeIcon(props: IconProps) {
  return <Speaker {...props}><Line d={WAVES} /></Speaker>;
}

export function MutedIcon(props: IconProps) {
  return <Speaker {...props}><Line d={MUTE} /></Speaker>;
}

export function FullscreenIcon(props: IconProps) {
  return <Icon {...props}><Line d={CORNERS_OUT} width={BOLD_LINE} /></Icon>;
}

export function ExitFullscreenIcon(props: IconProps) {
  return <Icon {...props}><Line d={CORNERS_IN} width={BOLD_LINE} /></Icon>;
}

export function ExpandIcon(props: IconProps) {
  return <Icon {...props}><Line d={EXPAND} /></Icon>;
}

export function CollapseIcon(props: IconProps) {
  return <Icon {...props}><Line d={COLLAPSE} /></Icon>;
}

export function ImageIcon(props: IconProps) {
  return <Picture {...props} />;
}

export function ImagePlusIcon(props: IconProps) {
  return (
    <Picture {...props} cuts={<circle {...BADGE} r={BADGE.r + GAP} />}>
      <Line d={BADGE_PLUS} width={BOLD_LINE} />
    </Picture>
  );
}

export function ImageOffIcon(props: IconProps) {
  return (
    <Picture {...props} cuts={<Line d={SLASH} width={LINE + 2 * GAP} />}>
      <Line d={SLASH} />
    </Picture>
  );
}
