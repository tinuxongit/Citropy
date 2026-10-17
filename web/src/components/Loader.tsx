import type { CSSProperties, HTMLAttributes } from "react";
import { onWindowActiveChange, windowActive } from "../lib/window-active.ts";

// The spinner is a strip of pre-drawn frames stepped through by mask position, so each step
// repaints a 1em box and does no filter work. Frame strip idea from Hermes Agent (MIT).
// Sliding the strip with a compositor transform showed a one-frame sideways jump in the desktop app.
const VIEW_BOX = 24;
const CENTER = VIEW_BOX / 2;
const FILTER_MARGIN = 4;
const DROPS = 3;
const DROP_RADIUS = 4.75;
const SPREAD = 6.75;
const LOOP_MS = 2400;
const SECTORS_PER_LOOP = 2;
const TURN_RADIANS = ((Math.PI * 2) / DROPS) * SECTORS_PER_LOOP;
const BLUR = 1.4;
const EDGE_PIXELS_PER_STEP = 3.5;
const MIN_SHARPNESS = 3;
const FRAMES = 48;
const TRAVEL_SAMPLES = 1200;

// One axis of a Bézier curve from 0 to 1 with control points p1 and p2.
function bezierAxis(p1: number, p2: number, t: number): number {
  return 3 * p1 * t * (1 - t) ** 2 + 3 * p2 * t ** 2 * (1 - t) + t ** 3;
}

// Binary search for the t where the curve's x axis reaches x.
function solveT(x1: number, x2: number, x: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step++) {
    const t = (low + high) / 2;
    if (bezierAxis(x1, x2, t) < x) low = t;
    else high = t;
  }
  return (low + high) / 2;
}

// Same curve as CSS cubic-bezier(), so the baked frames keep the old animation's easing.
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  return (x) => bezierAxis(y1, y2, solveT(x1, x2, x));
}

const turnEase = cubicBezier(0.5, 0.25, 0.5, 0.75);
const pushEase = cubicBezier(0.65, 0, 0.35, 1);

function drops(progress: number): [number, number][] {
  const turn = TURN_RADIANS * turnEase(progress);
  const push =
    SPREAD *
    (progress < 0.3
      ? pushEase(progress / 0.3)
      : progress < 0.7
        ? 1
        : 1 - pushEase((progress - 0.7) / 0.3));
  return Array.from({ length: DROPS }, (_, drop) => {
    const angle = (drop / DROPS) * Math.PI * 2 - Math.PI / 2 + turn;
    return [CENTER + Math.cos(angle) * push, CENTER + Math.sin(angle) * push];
  });
}

// Frames are spaced by how far the drops move, so fast stretches get more of them and still ones fewer.
const travel = [0];
let [previous] = drops(0) as [[number, number]];
for (let sample = 1; sample <= TRAVEL_SAMPLES; sample++) {
  const [current] = drops(sample / TRAVEL_SAMPLES) as [[number, number]];
  travel.push(travel.at(-1)! + Math.hypot(current[0] - previous[0], current[1] - previous[1]));
  previous = current;
}
const OFFSETS = Array.from(
  { length: FRAMES },
  (_, frame) =>
    travel.findIndex((distance) => distance >= (travel.at(-1)! * frame) / FRAMES) / TRAVEL_SAMPLES,
);
const KEYFRAMES: Keyframe[] = [
  ...OFFSETS.map((offset, frame) => ({
    offset,
    maskPosition: `0 ${-frame}em`,
    easing: "step-end",
  })),
  { offset: 1, maskPosition: `0 ${-(FRAMES - 1)}em` },
];

const strips = new Map<number, string>();

function strip(size: number): string {
  const cached = strips.get(size);
  if (cached) return cached;
  const sharpness = Math.max(MIN_SHARPNESS, size / EDGE_PIXELS_PER_STEP);
  const frames = OFFSETS.map(
    (progress, frame) =>
      `<g transform="translate(0 ${frame * VIEW_BOX})"><g filter="url(#goo)">${drops(progress)
        .map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${DROP_RADIUS}"/>`)
        .join("")}</g></g>`,
  ).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX * FRAMES}">` +
    `<filter id="goo" filterUnits="userSpaceOnUse" x="${-FILTER_MARGIN}" y="${-FILTER_MARGIN}" ` +
    `width="${VIEW_BOX + 2 * FILTER_MARGIN}" height="${VIEW_BOX + 2 * FILTER_MARGIN}">` +
    `<feGaussianBlur stdDeviation="${BLUR}"/>` +
    `<feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${sharpness} ${(1 - sharpness) / 2}"/>` +
    `</filter>${frames}</svg>`;
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  strips.set(size, image);
  return image;
}

// Every spinner starts at the document timeline's zero, so they all show the same frame.
// They keep animating while another app has focus, so they pause with the window.
const running = new Set<Animation>();

function sync(animation: Animation): void {
  // Setting the start time also resumes a paused animation.
  if (windowActive()) animation.startTime = 0;
  else animation.pause();
}

onWindowActiveChange(() => running.forEach(sync));

function animate(element: HTMLSpanElement | null) {
  if (!element) return;
  const animation = element.animate(KEYFRAMES, { duration: LOOP_MS, iterations: Infinity });
  sync(animation);
  running.add(animation);
  return () => {
    running.delete(animation);
    animation.cancel();
  };
}

export function Loader({
  size = 16,
  className,
  style,
  ...rest
}: { size?: number } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
      className={className ? `loader ${className}` : "loader"}
      ref={animate}
      style={
        {
          fontSize: size,
          "--loader-strip": strip(size),
          "--loader-height": `${FRAMES}em`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
