import type { HTMLAttributes } from "react";
import { onWindowActiveChange, windowActive } from "../lib/window-active.ts";

// Three drops split from the center, turn, and merge back. Every motion is a transform inside a
// fixed 1em box, so nothing around the spinner moves.
const LOOP_MS = 2400;
const SPREAD = "-0.28em";
const PUSH_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

const TURN: Keyframe[] = [{ rotate: "0deg" }, { rotate: "240deg" }];
const PUSH: Keyframe[] = [
  { offset: 0, transform: "translateY(0)", easing: PUSH_EASE },
  { offset: 0.3, transform: `translateY(${SPREAD})` },
  { offset: 0.7, transform: `translateY(${SPREAD})`, easing: PUSH_EASE },
  { offset: 1, transform: "translateY(0)" },
];

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
  const animations = [
    element.animate(TURN, {
      duration: LOOP_MS,
      iterations: Infinity,
      easing: "cubic-bezier(0.5, 0.25, 0.5, 0.75)",
    }),
    ...Array.from(element.children, (drop) =>
      drop.animate(PUSH, { duration: LOOP_MS, iterations: Infinity }),
    ),
  ];
  for (const animation of animations) {
    sync(animation);
    running.add(animation);
  }
  return () => {
    for (const animation of animations) {
      running.delete(animation);
      animation.cancel();
    }
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
      style={{ fontSize: size, ...style }}
    >
      <span />
      <span />
      <span />
    </span>
  );
}
