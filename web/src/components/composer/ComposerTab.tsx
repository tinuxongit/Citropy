import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { useTabMotion } from "./use-tab-motion.ts";

export function ComposerTab(props: ComponentProps<typeof motion.button>) {
  const tabMotion = useTabMotion();
  return <motion.button type="button" className="composer-tab" layout="position" {...tabMotion} {...props} />;
}
