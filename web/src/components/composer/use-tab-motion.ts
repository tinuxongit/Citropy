import type { MotionProps } from "motion/react";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";

const TAB_MOTION = {
  offscreen: "100%",
  enterSeconds: 0.24,
  exitSeconds: 0.2,
  enterEase: [0.16, 1, 0.3, 1],
  exitEase: [0.32, 0, 0.67, 0],
} as const;

export function useTabMotion(): Pick<MotionProps, "initial" | "animate" | "exit" | "transition"> {
  const reducedMotion = useReducedMotion();
  const hidden = { y: reducedMotion ? 0 : TAB_MOTION.offscreen };
  return {
    initial: hidden,
    animate: { y: 0 },
    exit: {
      ...hidden,
      pointerEvents: "none",
      transition: { duration: reducedMotion ? 0 : TAB_MOTION.exitSeconds, ease: TAB_MOTION.exitEase },
    },
    transition: { duration: reducedMotion ? 0 : TAB_MOTION.enterSeconds, ease: TAB_MOTION.enterEase },
  };
}
