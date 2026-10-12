import { useEffect, useState } from "react";
import { collapseBrowser, useBrowserTakeover } from "../lib/browser-takeover.ts";
import { useApp } from "../lib/store.ts";
import { BrowserPane } from "./BrowserPane.tsx";
import { CollapseIcon } from "./icons/media.tsx";

export function BrowserTakeover() {
  const tabId = useBrowserTakeover((state) => state.tabId);
  const panel = useApp((state) => state.panels.find((entry) => entry.id === tabId && entry.kind === "browser"));
  const open = Boolean(panel);
  const clearance = useComposerTabsHeight(open);
  useEffect(() => collapseBrowser, []);
  useEffect(() => {
    if (!open) return;
    const shrink = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) collapseBrowser();
    };
    window.addEventListener("keydown", shrink);
    return () => window.removeEventListener("keydown", shrink);
  }, [open]);
  if (!panel) return null;
  return (
    <section
      className="browser-takeover"
      aria-label={panel.title}
      style={{ bottom: clearance }}
    >
      <header className="browser-takeover-head">
        <h2 className="truncate">{panel.title}</h2>
        <button type="button" className="icon-btn" aria-label="Shrink browser" title="Shrink browser" onClick={collapseBrowser}>
          <CollapseIcon size={15} />
        </button>
      </header>
      <BrowserPane panel={panel} active />
    </section>
  );
}

function useComposerTabsHeight(watching: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const tabs = watching ? document.querySelector<HTMLElement>(".stage .composer-tabs") : null;
    if (!tabs) return;
    const observer = new ResizeObserver(() => setHeight(tabs.offsetHeight));
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [watching]);
  return height;
}
