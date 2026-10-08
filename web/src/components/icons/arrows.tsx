import { BOLD_LINE, GAP, Icon, Knockout, LINE, Line, Turn, type IconProps } from "./kit.tsx";

const ARROW_UP = "M12 19.5V5M5.5 11.25L12 4.75L18.5 11.25";
const ARROW_UP_RIGHT = "M6.5 17.5L17 7M8.5 6.5H17.5V15.5";
const SWAP = "M4 8H19.5M15.5 4L19.5 8L15.5 12M20 16H4.5M8.5 12L4.5 16L8.5 20";
const CORNER_DOWN_RIGHT = "M5 4V10.5A4.5 4.5 0 0 0 9.5 15H19.5M15 10.5L19.5 15L15 19.5";
const TO_LINE = "M5 3.5H19M12 20.5V8.5M6.75 13.5L12 8.25L17.25 13.5";
const FROM_LINE = "M5 20.5H19M12 15.5V3.5M6.75 8.75L12 3.5L17.25 8.75";
const DOWNLOAD_ARROW = "M12 2.75V12.5M7.25 8L12 12.75L16.75 8";
const TRAY = { x: 2.5, y: 15, width: 19, height: 6.5, rx: 3 };
const EXTERNAL_ARROW = "M10.75 13.25L20.5 3.5M14 3.5H20.5V10";
const EXTERNAL_BOX = { x: 2.5, y: 6.5, width: 15, height: 15, rx: 4 };

function Arrow({ degrees, ...props }: IconProps & { degrees: number }) {
  return <Icon {...props}><Turn degrees={degrees}><Line d={ARROW_UP} width={BOLD_LINE} /></Turn></Icon>;
}

export function ArrowUpIcon(props: IconProps) {
  return <Arrow degrees={0} {...props} />;
}

export function ArrowRightIcon(props: IconProps) {
  return <Arrow degrees={90} {...props} />;
}

export function ArrowDownIcon(props: IconProps) {
  return <Arrow degrees={180} {...props} />;
}

export function ArrowLeftIcon(props: IconProps) {
  return <Arrow degrees={270} {...props} />;
}

export function ArrowUpRightIcon(props: IconProps) {
  return <Icon {...props}><Line d={ARROW_UP_RIGHT} width={BOLD_LINE} /></Icon>;
}

export function SwapIcon(props: IconProps) {
  return <Icon {...props}><Line d={SWAP} /></Icon>;
}

export function CornerDownRightIcon(props: IconProps) {
  return <Icon {...props}><Line d={CORNER_DOWN_RIGHT} /></Icon>;
}

export function ArrowUpToLineIcon(props: IconProps) {
  return <Icon {...props}><Line d={TO_LINE} /></Icon>;
}

export function ArrowDownToLineIcon(props: IconProps) {
  return <Icon {...props}><Turn degrees={180}><Line d={TO_LINE} /></Turn></Icon>;
}

export function ArrowUpFromLineIcon(props: IconProps) {
  return <Icon {...props}><Line d={FROM_LINE} /></Icon>;
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={DOWNLOAD_ARROW} width={BOLD_LINE} />
      <rect {...TRAY} />
    </Icon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={EXTERNAL_ARROW} width={LINE + 2 * GAP} />}>
        <rect {...EXTERNAL_BOX} />
      </Knockout>
      <Line d={EXTERNAL_ARROW} />
    </Icon>
  );
}
