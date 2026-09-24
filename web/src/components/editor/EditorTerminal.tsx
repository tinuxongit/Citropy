import { useLayoutEffect, useRef } from "react";
import { Plus, TerminalSquare, X } from "lucide-react";
import { useI18n } from "../../lib/i18n.ts";
import { openEditorTerminal } from "../../lib/actions.ts";
import { setEditorTerminal, useApp } from "../../lib/store.ts";
import { send } from "../../lib/socket.ts";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { TerminalPane } from "../TerminalPane.tsx";
import { usePanelTabActions } from "../use-panel-tab-actions.tsx";
import type { PanelTab } from "../../../../shared/workbench.ts";

export function EditorTerminal({
  panelId,
  panels,
  selectedId,
  visible,
  active,
  onHide,
}: {
  panelId: string;
  panels: PanelTab[];
  selectedId?: string;
  visible: boolean;
  active: boolean;
  onHide: () => void;
}) {
  const t = useI18n();
  const connected = useApp((state) => state.connected);
  const tabStrip = useRef<HTMLDivElement>(null);
  const selected = panels.find((panel) => panel.id === selectedId);
  const tabActions = usePanelTabActions(panels, tabStrip, active && visible);

  useLayoutEffect(() => {
    const strip = tabStrip.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!active || !visible || !strip || !selected) return;
    const bounds = strip.getBoundingClientRect();
    const tab = selected.parentElement!.getBoundingClientRect();
    if (tab.left < bounds.left) strip.scrollLeft -= bounds.left - tab.left;
    else if (tab.right > bounds.right) strip.scrollLeft += tab.right - bounds.right;
  }, [active, visible, selected?.id, tabActions.orderKey]);

  return (
    <section className="editor-terminal" hidden={!visible} aria-label={t("Editor terminal")}>
      {tabActions.overlays}
      <div className="editor-terminal-heading">
        <div
          className="editor-terminal-tabs sliding-selection"
          ref={tabStrip}
          role="tablist"
          aria-label={t("Editor terminals")}
          onKeyDown={(event) => {
            if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="tab"]')) return;
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = panels.findIndex((panel) => panel.id === selectedId);
            const next = event.key === "Home"
              ? 0
              : event.key === "End"
                ? panels.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length;
            const panel = panels[next];
            if (!panel) return;
            setEditorTerminal(panelId, panel.id);
            document.getElementById(`editor-terminal-tab-${panelId}-${panel.id}`)?.focus({ preventScroll: true });
          }}
        >
          <SelectionHighlight value={`${selected?.id}:${tabActions.orderKey}`} selector='.editor-terminal-tab[data-active="true"]' />
          {tabActions.indicator}
          {panels.map((panel) => (
            <div className="editor-terminal-tab" key={panel.id} data-active={panel.id === selectedId} {...tabActions.tabProps(panel)}>
              <button
                type="button"
                role="tab"
                id={`editor-terminal-tab-${panelId}-${panel.id}`}
                aria-controls={`editor-terminal-body-${panelId}-${panel.id}`}
                aria-selected={panel.id === selectedId}
                aria-keyshortcuts="F2 Alt+ArrowLeft Alt+ArrowRight"
                tabIndex={panel.id === selectedId ? 0 : -1}
                title={panel.title}
                onClick={() => setEditorTerminal(panelId, panel.id)}
              >
                <TerminalSquare size={13} />
                <span className="truncate">{panel.title}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={!connected}
                aria-label={t("Close {name}", { name: panel.title })}
                title={t("Close {name}", { name: panel.title })}
                onClick={() => {
                  tabStrip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
                  send({ t: "panel.close", id: panel.id });
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          disabled={!connected}
          aria-label={t("New terminal")}
          title={t("New terminal")}
          onClick={() => openEditorTerminal(panelId, true)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("Hide terminal dock")}
          title={t("Hide terminal dock")}
          onClick={onHide}
        >
          <X size={14} />
        </button>
      </div>
      {panels.toSorted((a, b) => a.id.localeCompare(b.id)).map((panel) => (
        <div
          key={panel.id}
          className="editor-terminal-body"
          id={`editor-terminal-body-${panelId}-${panel.id}`}
          role="tabpanel"
          aria-labelledby={`editor-terminal-tab-${panelId}-${panel.id}`}
          hidden={panel.id !== selectedId}
        >
          <TerminalPane panel={panel} active={active && visible && panel.id === selectedId} />
        </div>
      ))}
      {!selected && (
        <div className="pane-empty" role="status">
          {t("Opening terminal…")}
        </div>
      )}
    </section>
  );
}
