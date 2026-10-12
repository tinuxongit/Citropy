import { useRef, type CSSProperties } from "react";
import type { BrowserState } from "../../../../shared/workbench.ts";
import { useBrowserSurface } from "../../lib/use-browser-surface.ts";
import { collapseBrowser, useBrowserTakeover } from "../../lib/browser-takeover.ts";

export function BotScreenPage({ page }: { page: BrowserState }) {
  const frame = useRef<HTMLDivElement>(null);
  const takenOver = useBrowserTakeover((state) => state.tabId === page.id);
  useBrowserSurface(page.id, frame, !takenOver);
  return (
    <div
      ref={frame}
      className="bot-screen-page"
      role={takenOver ? undefined : "img"}
      aria-label={takenOver ? undefined : `Browsing ${page.title}`}
      style={{ "--page-width": page.width, "--page-height": page.height } as CSSProperties}
    >
      {takenOver && (
        <div className="bot-screen-away">
          <span>Shown in the main view</span>
          <button type="button" className="btn" onClick={collapseBrowser}>Shrink</button>
        </div>
      )}
    </div>
  );
}
