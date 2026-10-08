import type { ReactNode } from "react";
import { Icon, Knockout, Line, type IconProps } from "./kit.tsx";
import { GlyphCut, HELP } from "./status.tsx";

const ROUNDING = 1;
const SQUARE_BUBBLE = "M6 3H18A3.5 3.5 0 0 1 21.5 6.5V14A3.5 3.5 0 0 1 18 17.5H9L4.5 21.25V17.4A3.5 3.5 0 0 1 2.5 14V6.5A3.5 3.5 0 0 1 6 3Z";
const ROUND_BUBBLE = "M12 2.5A9.5 9.5 0 1 1 7.6 20.4L3 21.5L4.1 17A9.5 9.5 0 0 1 12 2.5Z";
const PLUS = "M12 6.5V14M8.25 10.25H15.75";
const PLUS_WIDTH = 2;

function Bubble({ d, cuts, ...props }: IconProps & { d: string; cuts?: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={cuts}><path d={d} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Knockout>
    </Icon>
  );
}

export function MessageIcon(props: IconProps) {
  return <Bubble {...props} d={SQUARE_BUBBLE} />;
}

export function NewMessageIcon(props: IconProps) {
  return <Bubble {...props} d={SQUARE_BUBBLE} cuts={<Line d={PLUS} width={PLUS_WIDTH} />} />;
}

export function QuestionMessageIcon(props: IconProps) {
  return <Bubble {...props} d={ROUND_BUBBLE} cuts={<GlyphCut glyph={HELP} />} />;
}
