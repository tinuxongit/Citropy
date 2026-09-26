import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";

export function ComposerTab(props: ComponentProps<typeof motion.button>) {
  const reducedMotion = useReducedMotion();
  const hidden = reducedMotion ? 0 : "100%";
  return (
    <motion.button
      type="button"
      className="composer-tab"
      layout="position"
      initial={{ y: hidden }}
      animate={{ y: 0 }}
      exit={{ y: hidden, pointerEvents: "none", transition: { duration: reducedMotion ? 0 : 0.2, ease: [0.32, 0, 0.67, 0] } }}
      transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    />
  );
}
