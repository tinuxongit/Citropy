import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { motion } from "motion/react";
import { useTabMotion } from "./use-tab-motion.ts";
import { ChevronDownIcon, ChevronUpIcon } from "../icons/chevrons.tsx";

const LowerContext = createContext<(() => void) | null>(null);

// Passing a summary lets the user lower the tab to a single bar so the chat behind it stays readable.
export function ComposerWideTab({
  className,
  summary,
  children,
  ...props
}: Omit<ComponentProps<typeof motion.section>, "children"> & {
  children: ReactNode;
  summary?: ReactNode;
}) {
  const tabMotion = useTabMotion();
  const [lowered, setLowered] = useState(false);
  return (
    <motion.section
      className={`composer-wide-tab ${className}`}
      data-lowered={lowered || undefined}
      {...tabMotion}
      {...props}
    >
      {lowered && (
        <button
          type="button"
          className="composer-wide-tab-raise"
          autoFocus
          onClick={() => setLowered(false)}
        >
          <span className="composer-wide-tab-summary">{summary}</span>
          <ChevronUpIcon size={14} aria-hidden="true" />
        </button>
      )}
      <LowerContext value={summary === undefined ? null : () => setLowered(true)}>
        {children}
      </LowerContext>
    </motion.section>
  );
}

export function LowerButton() {
  const lower = useContext(LowerContext);
  return (
    lower && (
      <button
        type="button"
        className="icon-btn composer-lower"
        title="Lower to read the chat"
        aria-label="Lower"
        onClick={lower}
      >
        <ChevronDownIcon size={14} />
      </button>
    )
  );
}
