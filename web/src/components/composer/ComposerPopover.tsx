import { useRef, type ReactNode, type RefObject } from "react";
import { motion } from "motion/react";
import { useAnchoredPanel, useDismiss } from "../../lib/use-anchored-panel.ts";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";

const PANEL = { risePx: 5, seconds: 0.16 };

export function ComposerPopover({ id, label, className, anchor, width, onClose, children }: {
  id: string;
  label: string;
  className: string;
  anchor: RefObject<HTMLButtonElement | null>;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const hidden = { opacity: 0, transform: reducedMotion ? "none" : `translateY(${PANEL.risePx}px)` };
  useAnchoredPanel(panel, anchor, { open: true, width });
  useDismiss(panel, anchor, onClose, { open: true, outside: true });
  return (
    <motion.section
      ref={panel}
      id={id}
      popover="manual"
      role="dialog"
      aria-label={label}
      className={`tab-panel ${className}`}
      initial={hidden}
      animate={{ opacity: 1, transform: "none" }}
      exit={{ ...hidden, pointerEvents: "none" }}
      transition={{ duration: reducedMotion ? 0 : PANEL.seconds }}
    >
      {children}
    </motion.section>
  );
}
