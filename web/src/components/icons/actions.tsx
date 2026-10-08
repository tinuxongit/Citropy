import type { ReactNode } from "react";
import { BOLD_LINE, CUT, GAP, Icon, Knockout, LINE, Line, type IconProps } from "./kit.tsx";
import { CORNERS_OUT } from "./media.tsx";

const ROUNDING = 1.5;
const SLASH = "M3 3L21 21";
const SLASH_GAP = LINE + 2 * GAP;
const TRASH = { lid: { x: 3, y: 4.25, width: 18, height: 2.75, rx: 1.375 }, handle: { x: 9, y: 1.75, width: 6, height: 3.5, rx: 1.25 }, can: "M5 8.5H19L18.1 19.4A2.75 2.75 0 0 1 15.35 22H8.65A2.75 2.75 0 0 1 5.9 19.4Z", slots: "M10 12V18.25M14 12V18.25" };
const ARCHIVE = { lid: { x: 2, y: 3, width: 20, height: 5.5, rx: 2 }, box: { x: 3.5, y: 10, width: 17, height: 11, rx: 2.5 }, slot: "M10 13.75H14", restore: "M12 18.75V13.5M9.5 16L12 13.5L14.5 16" };
const PIN = "M7.5 2.5H16.5V4.75H15.5V9.5L18.5 13V15.5H5.5V13L8.5 9.5V4.75H7.5Z";
const PIN_NEEDLE = "M12 15.5V21.5";
const SHEET = { width: 13.5, height: 13.5, rx: 3 };
const BACK_SHEET = { x: 2.5, y: 2.5 };
const FRONT_SHEET = { x: 8, y: 8 };
const SHEET_PLUS = "M14.75 11.75V17.75M11.75 14.75H17.75";
const FLOPPY = "M2.5 5.5A3 3 0 0 1 5.5 2.5H16.25L21.5 7.75V18.5A3 3 0 0 1 18.5 21.5H5.5A3 3 0 0 1 2.5 18.5Z";
const FLOPPY_LABEL = { x: 7, y: 13.25, width: 10, height: 5.75, rx: 1.25 };
const FLOPPY_SHUTTER = "M7.75 6.75H13.5";
const EYE = "M1.75 12C3.75 7.5 7.5 4.75 12 4.75C16.5 4.75 20.25 7.5 22.25 12C20.25 16.5 16.5 19.25 12 19.25C7.5 19.25 3.75 16.5 1.75 12Z";
const IRIS = { cx: 12, cy: 12, r: 4.5 };
const PUPIL = { cx: 12, cy: 12, r: 2.5 };
const STAR = "M12 2.75L14.85 8.6L21.25 9.5L16.6 14L17.7 20.4L12 17.4L6.3 20.4L7.4 14L2.75 9.5L9.15 8.6Z";
const LENS = { cx: 10.5, cy: 10.5, r: 7 };
const LENS_WIDTH = 3;
const HANDLE = "M16 16L21 21";
const HANDLE_WIDTH = 3.5;
const GLINT = "M7 10.5A3.5 3.5 0 0 1 10.5 7";
const GLINT_WIDTH = 2;
const LENS_CHECK = "M7.75 10.75L9.75 12.75L13.25 9";
const SCAN_LENS = { cx: 11, cy: 11, r: 3.5 };
const SCAN_HANDLE = "M13.75 13.75L16.25 16.25";

function Slashed({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={<Line d={SLASH} width={SLASH_GAP} />}>{children}</Knockout>
      <Line d={SLASH} />
    </Icon>
  );
}

function ArchiveBox({ cut, ...props }: IconProps & { cut: string }) {
  return (
    <Icon {...props}>
      <rect {...ARCHIVE.lid} />
      <Knockout cuts={<Line d={cut} width={2} />}><rect {...ARCHIVE.box} /></Knockout>
    </Icon>
  );
}

function Sheets({ cuts, ...props }: IconProps & { cuts?: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={<rect {...SHEET} {...FRONT_SHEET} x={FRONT_SHEET.x - GAP} y={FRONT_SHEET.y - GAP} width={SHEET.width + 2 * GAP} height={SHEET.height + 2 * GAP} rx={SHEET.rx + GAP} />}>
        <rect {...SHEET} {...BACK_SHEET} />
      </Knockout>
      <Knockout cuts={cuts}><rect {...SHEET} {...FRONT_SHEET} /></Knockout>
    </Icon>
  );
}

function Eye() {
  return (
    <>
      <Knockout cuts={<circle {...IRIS} />}><path d={EYE} /></Knockout>
      <circle {...PUPIL} />
    </>
  );
}

function Pin() {
  return (
    <>
      <path d={PIN} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" />
      <Line d={PIN_NEEDLE} />
    </>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...TRASH.handle} />
      <rect {...TRASH.lid} />
      <Knockout cuts={<Line d={TRASH.slots} width={CUT} />}><path d={TRASH.can} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" /></Knockout>
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return <ArchiveBox {...props} cut={ARCHIVE.slot} />;
}

export function ArchiveRestoreIcon(props: IconProps) {
  return <ArchiveBox {...props} cut={ARCHIVE.restore} />;
}

export function PinIcon(props: IconProps) {
  return <Icon {...props}><Pin /></Icon>;
}

export function PinOffIcon(props: IconProps) {
  return <Slashed {...props}><Pin /></Slashed>;
}

export function CopyIcon(props: IconProps) {
  return <Sheets {...props} />;
}

export function CopyPlusIcon(props: IconProps) {
  return <Sheets {...props} cuts={<Line d={SHEET_PLUS} width={2} />} />;
}

export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><rect {...FLOPPY_LABEL} /><Line d={FLOPPY_SHUTTER} width={2} /></>}>
        <path d={FLOPPY} stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" />
      </Knockout>
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return <Icon {...props}><Eye /></Icon>;
}

export function EyeOffIcon(props: IconProps) {
  return <Slashed {...props}><Eye /></Slashed>;
}

export function StarIcon(props: IconProps) {
  return <Icon fill="none" {...props}><path d={STAR} stroke="currentColor" strokeWidth={LINE} strokeLinejoin="round" /></Icon>;
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle {...LENS} fill="none" stroke="currentColor" strokeWidth={LENS_WIDTH} />
      <Line d={HANDLE} width={HANDLE_WIDTH} />
      <Line d={GLINT} width={GLINT_WIDTH} />
    </Icon>
  );
}

export function SearchCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle {...LENS} fill="none" stroke="currentColor" strokeWidth={LENS_WIDTH} />
      <Line d={HANDLE} width={HANDLE_WIDTH} />
      <Line d={LENS_CHECK} width={GLINT_WIDTH} />
    </Icon>
  );
}

export function ScanSearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Line d={CORNERS_OUT} width={LINE} />
      <circle {...SCAN_LENS} fill="none" stroke="currentColor" strokeWidth={LINE} />
      <Line d={SCAN_HANDLE} width={BOLD_LINE} />
    </Icon>
  );
}
