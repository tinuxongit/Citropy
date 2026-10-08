import { useEffect, useState } from "react";
import type { DesktopWindowState } from "../desktop.d.ts";

const GLYPH_SIZE = 10;

const glyphs = {
  minimize: <path d="M0 5.5H10" />,
  maximize: <rect x="0.5" y="0.5" width="9" height="9" />,
  restore: <><rect x="0.5" y="2.5" width="7" height="7" /><path d="M2.5 2.5V0.5H9.5V7.5H7.5" /></>,
  close: <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" shapeRendering="geometricPrecision" />,
};

function Glyph({ name }: { name: keyof typeof glyphs }) {
  return <svg className="window-glyph" width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 10 10" aria-hidden="true">{glyphs[name]}</svg>;
}

export function WindowControls() {
  const [state, setState] = useState<DesktopWindowState>();
  useEffect(() => {
    const apply = (state: DesktopWindowState) => {
      setState(state);
      document.documentElement.dataset.platform = state.platform;
    };
    void window.citropyDesktop?.windowState?.().then(apply);
    return window.citropyDesktop?.onWindowState?.(apply);
  }, []);
  if (!window.citropyDesktop?.windowCommand || state?.platform === "darwin")
    return null;
  return (
    <div className="window-controls" role="group" aria-label="Window controls">
      <button
        type="button"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void window.citropyDesktop?.windowCommand("minimize")}
      >
        <Glyph name="minimize" />
      </button>
      <button
        type="button"
        aria-label={state?.maximized ? "Restore window" : "Maximize window"}
        title={state?.maximized ? "Restore" : "Maximize"}
        onClick={() => void window.citropyDesktop?.windowCommand("maximize")}
      >
        <Glyph name={state?.maximized ? "restore" : "maximize"} />
      </button>
      <button
        type="button"
        className="window-close"
        aria-label="Close window"
        title="Close window"
        onClick={() => void window.citropyDesktop?.windowCommand("close")}
      >
        <Glyph name="close" />
      </button>
    </div>
  );
}
