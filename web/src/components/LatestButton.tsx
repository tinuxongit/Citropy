import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";

const SHOW_DELAY_MS = 150;

export function LatestButton({ away, onJump }: { away: boolean; onJump: () => void }) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    if (!away) return;
    const timer = window.setTimeout(() => setSettled(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [away]);

  const visible = away && settled;
  return (
    <div className="conversation-jump">
      <button type="button" className="jump" data-visible={visible || undefined} tabIndex={visible ? undefined : -1} aria-hidden={!visible || undefined} onClick={onJump}>
        <ArrowDown size={13} strokeWidth={2.25} aria-hidden="true" />
        Latest
      </button>
    </div>
  );
}
