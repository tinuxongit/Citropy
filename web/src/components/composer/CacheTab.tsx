import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FlameIcon } from "../icons/nature.tsx";
import { useApp } from "../../lib/store.ts";
import { useVisibleInterval } from "../../lib/use-visible-interval.ts";
import { useTabMotion } from "./use-tab-motion.ts";

const WARNING_MS = 5 * 60_000;
const LAST_MINUTE_MS = 60_000;

function countdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CacheTab({ threadId }: { threadId: string }) {
  const expiresAt = useApp((state) => state.threads[threadId]?.usage.cacheExpiresAt);
  const running = useApp((state) => Boolean(state.threads[threadId]?.running));
  const tabMotion = useTabMotion();
  const [, tick] = useState(0);
  const left = expiresAt === undefined ? 0 : expiresAt - Date.now();
  const expiring = !running && left > 0 && left <= WARNING_MS;
  useVisibleInterval(
    () => tick((value) => value + 1),
    expiring ? 1000 : 15_000,
    !running && left > 0,
  );
  // The fuse burns down over the warning window, so its length is the share of time left.
  const fuse = { "--fuse": Math.min(left / WARNING_MS, 1) } as CSSProperties;
  return (
    <AnimatePresence>
      {expiring && (
        <motion.div
          key="cache"
          className="composer-tab cache-tab"
          layout="position"
          {...tabMotion}
          role="timer"
          aria-label={`Prompt cache cools down in ${countdown(left)}`}
          data-last-minute={left <= LAST_MINUTE_MS || undefined}
          style={fuse}
        >
          <FlameIcon size={13} aria-hidden="true" />
          <span>{countdown(left)}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
