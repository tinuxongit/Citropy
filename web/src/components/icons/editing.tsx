import { BOLD_LINE, Icon, LINE, Line, Turn, type IconProps } from "./kit.tsx";

const HEAVY_LINE = 3;
const NUMBER_LINE = 1.75;
const BOLD = "M7 4.5H13A3.75 3.75 0 0 1 13 12H7ZM7 12H14A3.75 3.75 0 0 1 14 19.5H7Z";
const ITALIC = "M10 4.5H18M6 19.5H14M14.5 4.5L9.5 19.5";
const STRIKE = "M4 12H20M16.5 6.5C15.75 5.25 14.25 4.5 12 4.5C9.25 4.5 7.5 5.9 7.5 7.9C7.5 9.25 8.25 10.25 9.75 10.9M7.5 17.5C8.25 18.75 9.75 19.5 12 19.5C14.75 19.5 16.5 18.1 16.5 16.1C16.5 15.4 16.3 14.8 15.9 14.3";
const HEADING = "M3.5 5V19M12 5V19M3.5 12H12";
const HEADING_TWO = "M15.75 11.25A2.4 2.4 0 0 1 20.5 11.6C20.5 13.75 15.75 15.5 15.75 19H20.5";
const LIST_LINES = "M9.5 6H20M9.5 12H20M9.5 18H20";
const LIST_DOTS = [6, 12, 18];
const LIST_DOT = { cx: 4.75, r: 1.75 };
const NUMBERS = "M3.75 4.5H5V9.5M3.5 14.6A1.4 1.4 0 0 1 6.25 14.75C6.25 16 3.5 17.25 3.5 19.5H6.25";
const CODE = "M8 7L3 12L8 17M16 7L21 12L16 17";
const CODE_SLASH = "M13.75 4.5L10.25 19.5";
const BRACE = "M8.5 3.5H7.5A2.25 2.25 0 0 0 5.25 5.75V9.75A2.25 2.25 0 0 1 3 12A2.25 2.25 0 0 1 5.25 14.25V18.25A2.25 2.25 0 0 0 7.5 20.5H8.5";
const WRAP = "M3.5 6H20.5M3.5 18H9M3.5 12H17A3 3 0 0 1 17 18H13M15 15.75L12.75 18L15 20.25";
const JUSTIFY = "M4 5.5H20M4 10H20M4 14.5H20M4 19H20";
const TYPE = "M5 7V4.5H19V7M12 4.5V19.5M9 19.5H15";
const LINK = { left: { x: 1.75, y: 8.75, width: 11, height: 6.5, rx: 3.25 }, right: { x: 11.25, y: 8.75, width: 11, height: 6.5, rx: 3.25 }, bar: "M9 12H15" };
const LINK_TILT = -45;
const QUOTE_SHIFTS = [0, 10];
const QUOTE_LEFT = 3;
const QUOTE = { width: 8, height: 7.5, rx: 2.5, top: 5 };
const QUOTE_TAIL = "M9.75 10.5C9.75 15.25 7.75 18 4.25 19.25";

function Glyph({ d, weight = LINE, ...props }: IconProps & { d: string; weight?: number }) {
  return <Icon {...props}><Line d={d} width={weight} /></Icon>;
}

export function BoldIcon(props: IconProps) {
  return <Glyph {...props} d={BOLD} weight={HEAVY_LINE} />;
}

export function ItalicIcon(props: IconProps) {
  return <Glyph {...props} d={ITALIC} />;
}

export function StrikethroughIcon(props: IconProps) {
  return <Glyph {...props} d={STRIKE} />;
}

export function HeadingTwoIcon(props: IconProps) {
  return <Icon {...props}><Line d={HEADING} width={BOLD_LINE} /><Line d={HEADING_TWO} width={NUMBER_LINE + 0.5} /></Icon>;
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={LIST_LINES} />
      {LIST_DOTS.map((cy) => <circle key={cy} {...LIST_DOT} cy={cy} />)}
    </Icon>
  );
}

export function ListOrderedIcon(props: IconProps) {
  return <Icon {...props}><Line d={LIST_LINES} /><Line d={NUMBERS} width={NUMBER_LINE} /></Icon>;
}

export function CodeIcon(props: IconProps) {
  return <Glyph {...props} d={CODE} weight={BOLD_LINE} />;
}

export function CodeXmlIcon(props: IconProps) {
  return <Glyph {...props} d={`${CODE}${CODE_SLASH}`} weight={BOLD_LINE} />;
}

export function BracesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={BRACE} />
      <Turn mirror><Line d={BRACE} /></Turn>
    </Icon>
  );
}

export function WrapTextIcon(props: IconProps) {
  return <Glyph {...props} d={WRAP} />;
}

export function JustifyIcon(props: IconProps) {
  return <Glyph {...props} d={JUSTIFY} />;
}

export function TypeIcon(props: IconProps) {
  return <Glyph {...props} d={TYPE} weight={BOLD_LINE} />;
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Turn degrees={LINK_TILT}>
        <rect {...LINK.left} fill="none" stroke="currentColor" strokeWidth={LINE} />
        <rect {...LINK.right} fill="none" stroke="currentColor" strokeWidth={LINE} />
        <Line d={LINK.bar} />
      </Turn>
    </Icon>
  );
}

export function QuoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {QUOTE_SHIFTS.map((shift) => (
        <g key={shift} transform={`translate(${shift} 0)`}>
          <rect x={QUOTE_LEFT} y={QUOTE.top} width={QUOTE.width} height={QUOTE.height} rx={QUOTE.rx} />
          <Line d={QUOTE_TAIL} />
        </g>
      ))}
    </Icon>
  );
}
