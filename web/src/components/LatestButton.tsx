import { useEffect, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";

const SHOW_AFTER = 240;
const HIDE_WITHIN = 80;

export function LatestButton({ viewport, onJump }: { viewport: RefObject<HTMLElement | null>; onJump: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const update = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      setVisible((shown) => shown ? distance > HIDE_WITHIN : distance > SHOW_AFTER);
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [viewport]);

  return (
    <div className="conversation-jump">
      <button type="button" className="jump" data-visible={visible || undefined} tabIndex={visible ? undefined : -1} aria-hidden={!visible || undefined} onClick={onJump}>
        <ChevronDown size={14} aria-hidden="true" />
        Latest
      </button>
    </div>
  );
}
