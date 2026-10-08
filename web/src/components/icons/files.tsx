import type { ReactNode } from "react";
import { CUT, GAP, Icon, Knockout, Line, type IconProps } from "./kit.tsx";

const PAGE = "M6.5 2H13.25L20.5 9.25V19A3 3 0 0 1 17.5 22H6.5A3 3 0 0 1 3.5 19V5A3 3 0 0 1 6.5 2Z";
const FOLD = "M13 1V6.75A2.5 2.5 0 0 0 15.5 9.25H21.5";
const GLYPH_WIDTH = 1.75;
const TEXT_LINES = "M8 13.5H15.5M8 17.5H13";
const CODE = "M10 12.5L7.75 15L10 17.5M14 12.5L16.25 15L14 17.5";
const DIFF = "M12 10.5V15.5M9.5 13H14.5M9.5 18.25H14.5";
const PLUS = "M12 12V18M9 15H15";
const ZIPPER = "M10.5 11H12M12 13H13.5M10.5 15H12M12 17H13.5";
const ZIPPER_PULL = { x: 10.25, y: 18.25, width: 3.5, height: 2, rx: 0.75 };
const NOTE = { head: { cx: 9.75, cy: 17.5, r: 1.75 }, stem: "M11.5 17.5V11.75L14.75 12.75" };
const COG = { cx: 12, cy: 15.25, r: 2.75 };
const COG_TEETH = "M12 11V11.75M12 18.75V19.5M7.75 15.25H8.5M15.5 15.25H16.25M9 12.25L9.5 12.75M14.5 17.75L15 18.25M9 18.25L9.5 17.75M14.5 12.75L15 12.25";
const MOUNTAIN = "M7 19.5L10.25 16.25L12.25 18.25L13.75 16.75L17 19.5";
const SUN = { cx: 9.5, cy: 12.75, r: 1.5 };
const KEY = { ring: { cx: 9.75, cy: 16, r: 2 }, shaft: "M11.25 14.5L15.5 10.25M14 11.75L15.5 13.25" };
const LOCK = { body: { x: 8.5, y: 14.5, width: 7, height: 5, rx: 1 }, shackle: "M10 14.5V13A2 2 0 0 1 14 13V14.5" };
const GRID = "M7.5 12.5H16.5M7.5 16.25H16.5M12 11V19.5";
const LETTER = "M9 12H15M12 12V18.5";
const PLAY = "M10.25 12L15 15L10.25 18Z";
const PLAY_ROUNDING = 1.25;
const STACK_SCALE = 0.82;
const STACK_FRONT = { dx: -0.85, dy: 3.95 };
const STACK_BACK = { dx: 5.2, dy: 0.35 };

function Page({ glyph, ...props }: IconProps & { glyph?: ReactNode }) {
  return (
    <Icon {...props}>
      <Knockout cuts={<><Line d={FOLD} width={CUT} />{glyph}</>}><path d={PAGE} /></Knockout>
    </Icon>
  );
}

function Strokes({ d }: { d: string }) {
  return <Line d={d} width={GLYPH_WIDTH} />;
}

export function PageIcon(props: IconProps) {
  return <Page {...props} />;
}

export function FileTextIcon(props: IconProps) {
  return <Page {...props} glyph={<Strokes d={TEXT_LINES} />} />;
}

export function FileCodeIcon(props: IconProps) {
  return <Page {...props} glyph={<Strokes d={CODE} />} />;
}

export function FileDiffIcon(props: IconProps) {
  return <Page {...props} glyph={<Strokes d={DIFF} />} />;
}

export function FilePlusIcon(props: IconProps) {
  return <Page {...props} glyph={<Strokes d={PLUS} />} />;
}

export function FileArchiveIcon(props: IconProps) {
  return <Page {...props} glyph={<><Strokes d={ZIPPER} /><rect {...ZIPPER_PULL} /></>} />;
}

export function FileAudioIcon(props: IconProps) {
  return <Page {...props} glyph={<><circle {...NOTE.head} /><Strokes d={NOTE.stem} /></>} />;
}

export function FileCogIcon(props: IconProps) {
  return <Page {...props} glyph={<><circle {...COG} fill="none" stroke="currentColor" strokeWidth={GLYPH_WIDTH} /><Strokes d={COG_TEETH} /></>} />;
}

export function FileImageIcon(props: IconProps) {
  return <Page {...props} glyph={<><Strokes d={MOUNTAIN} /><circle {...SUN} /></>} />;
}

export function FileKeyIcon(props: IconProps) {
  return <Page {...props} glyph={<><circle {...KEY.ring} fill="none" stroke="currentColor" strokeWidth={GLYPH_WIDTH} /><Strokes d={KEY.shaft} /></>} />;
}

export function FileLockIcon(props: IconProps) {
  return <Page {...props} glyph={<><rect {...LOCK.body} /><Strokes d={LOCK.shackle} /></>} />;
}

export function FileSpreadsheetIcon(props: IconProps) {
  return <Page {...props} glyph={<Strokes d={GRID} />} />;
}

export function FileTypeIcon(props: IconProps) {
  return <Page {...props} glyph={<Strokes d={LETTER} />} />;
}

export function FileVideoIcon(props: IconProps) {
  return <Page {...props} glyph={<path d={PLAY} stroke="currentColor" strokeWidth={PLAY_ROUNDING} strokeLinejoin="round" />} />;
}

export function FilesIcon(props: IconProps) {
  const place = ({ dx, dy }: typeof STACK_BACK) => `translate(${dx} ${dy}) scale(${STACK_SCALE})`;
  const front = place(STACK_FRONT);
  return (
    <Icon {...props}>
      <Knockout cuts={<path d={PAGE} transform={front} stroke="currentColor" strokeWidth={(2 * GAP) / STACK_SCALE} strokeLinejoin="round" />}>
        <path d={PAGE} transform={place(STACK_BACK)} />
      </Knockout>
      <Knockout cuts={<Line d={FOLD} width={CUT / STACK_SCALE} transform={front} />}><path d={PAGE} transform={front} /></Knockout>
    </Icon>
  );
}
