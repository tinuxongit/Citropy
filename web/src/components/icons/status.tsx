import type { ReactNode } from "react";
import { BOLD_LINE, Icon, Knockout, LINE, Line, type IconProps } from "./kit.tsx";

const CENTER = 12;
const DISC_RADIUS = 10;
const RING_RADIUS = 8.75;
const DOT_RING_INNER = 6.5;
const DOT_RADIUS = 3;
const MARK_WIDTH = 2.25;
const CHECK = "M7.5 12.25L10.75 15.5L16.5 9.25";
const CROSS = "M8.75 8.75L15.25 15.25M15.25 8.75L8.75 15.25";
const ALERT = { line: "M12 7V12.75", dot: { cx: 12, cy: 16.5, r: 1.4 } };
export const HELP = { line: "M9.25 9.5A2.85 2.85 0 0 1 12 7.25C13.6 7.25 14.85 8.4 14.85 9.85C14.85 11.85 12 12.1 12 13.75", dot: { cx: 12, cy: 17, r: 1.4 } };
const INFO = { line: "M12 11V16.75", dot: { cx: 12, cy: 7.5, r: 1.4 } };
const BAN = "M5.8 5.8L18.2 18.2";
const TRIANGLE = "M10.27 3.5a2 2 0 0 1 3.46 0l8.06 14a2 2 0 0 1-1.73 3H3.94a2 2 0 0 1-1.73-3z";
const TRIANGLE_ALERT = { line: "M12 9V13.75", dot: { cx: 12, cy: 17, r: 1.4 } };
const SHIELD = "M11.3 2.25a2 2 0 0 1 1.4 0l6.5 2.4A2 2 0 0 1 20.5 6.5V11c0 5.4-3.6 9.3-8.1 10.8a1.3 1.3 0 0 1-.8 0C7.1 20.3 3.5 16.4 3.5 11V6.5a2 2 0 0 1 1.3-1.85z";
const SHIELD_CHECK = "M8.25 12L11 14.75L15.75 9.5";
const SHIELD_HELP = { line: "M9.5 9.25A2.6 2.6 0 0 1 12 7.25C13.45 7.25 14.6 8.3 14.6 9.6C14.6 11.4 12 11.65 12 13.25", dot: { cx: 12, cy: 16.5, r: 1.35 } };
const CLOCK_HANDS = "M12 6.75V12H16";
const HOURGLASS_CAPS = "M5.5 2.75H18.5M5.5 21.25H18.5";
const HOURGLASS_TOP = "M7.25 3.5H16.75V6.9A3 3 0 0 1 15.7 9.2L12 12.4L8.3 9.2A3 3 0 0 1 7.25 6.9z";
const HOURGLASS_BOTTOM = "M7.25 20.5H16.75V17.1A3 3 0 0 0 15.7 14.8L12 11.6L8.3 14.8A3 3 0 0 0 7.25 17.1z";
const HOURGLASS_ROUNDING = 1;

type Glyph = { line: string; dot: { cx: number; cy: number; r: number } };

export function GlyphCut({ glyph }: { glyph: Glyph }) {
  return (
    <>
      <Line d={glyph.line} width={MARK_WIDTH} />
      <circle {...glyph.dot} />
    </>
  );
}

function Disc({ cuts, ...props }: IconProps & { cuts: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={cuts}><circle cx={CENTER} cy={CENTER} r={DISC_RADIUS} /></Knockout>
    </Icon>
  );
}

export function CircleIcon(props: IconProps) {
  return <Icon {...props}><circle cx={CENTER} cy={CENTER} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={LINE} /></Icon>;
}

export function CircleDotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<circle cx={CENTER} cy={CENTER} r={DOT_RING_INNER} />}>
        <circle cx={CENTER} cy={CENTER} r={DISC_RADIUS} />
      </Knockout>
      <circle cx={CENTER} cy={CENTER} r={DOT_RADIUS} />
    </Icon>
  );
}

export function CircleCheckIcon(props: IconProps) {
  return <Disc {...props} cuts={<Line d={CHECK} width={MARK_WIDTH} />} />;
}

export function CircleXIcon(props: IconProps) {
  return <Disc {...props} cuts={<Line d={CROSS} width={MARK_WIDTH} />} />;
}

export function CircleAlertIcon(props: IconProps) {
  return <Disc {...props} cuts={<GlyphCut glyph={ALERT} />} />;
}

export function CircleHelpIcon(props: IconProps) {
  return <Disc {...props} cuts={<GlyphCut glyph={HELP} />} />;
}

export function InfoIcon(props: IconProps) {
  return <Disc {...props} cuts={<GlyphCut glyph={INFO} />} />;
}

export function ClockIcon(props: IconProps) {
  return <Disc {...props} cuts={<Line d={CLOCK_HANDS} width={MARK_WIDTH} />} />;
}

export function BanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={BOLD_LINE} />
      <Line d={BAN} width={BOLD_LINE} />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<GlyphCut glyph={TRIANGLE_ALERT} />}><path d={TRIANGLE} /></Knockout>
    </Icon>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={SHIELD_CHECK} width={MARK_WIDTH} />}><path d={SHIELD} /></Knockout>
    </Icon>
  );
}

export function ShieldHelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<GlyphCut glyph={SHIELD_HELP} />}><path d={SHIELD} /></Knockout>
    </Icon>
  );
}

export function HourglassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={HOURGLASS_CAPS} width={LINE} />
      <path d={HOURGLASS_TOP} stroke="currentColor" strokeWidth={HOURGLASS_ROUNDING} strokeLinejoin="round" />
      <path d={HOURGLASS_BOTTOM} stroke="currentColor" strokeWidth={HOURGLASS_ROUNDING} strokeLinejoin="round" />
    </Icon>
  );
}
