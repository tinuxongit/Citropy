import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { useTabMotion } from "./use-tab-motion.ts";

export function ComposerWideTab({ className, ...props }: ComponentProps<typeof motion.section>) {
  const tabMotion = useTabMotion();
  return <motion.section className={`composer-wide-tab ${className}`} {...tabMotion} {...props} />;
}
