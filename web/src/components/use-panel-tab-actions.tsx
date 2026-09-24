import { useEffect, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import { ArrowLeft, ArrowRight, Pencil, X } from "lucide-react";
import type { PanelTab } from "../../../shared/workbench.ts";
import { moveWorkbenchPanel } from "../lib/actions.ts";
import { useI18n } from "../lib/i18n.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { Menu } from "./Menu.tsx";
import { Modal } from "./Modal.tsx";
import { canStartPointerDrag, followPointerDrag } from "./sidebar/pointer-drag.ts";

type TabAnchor = { id: string; anchor: HTMLElement };
type TabDrop = { id: string; edge: "before" | "after" };

export function usePanelTabActions(panels: PanelTab[], strip: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const t = useI18n();
  const connected = useApp((state) => state.connected);
  const [menu, setMenu] = useState<TabAnchor>();
  const [rename, setRename] = useState<TabAnchor & { name: string }>();
  const [dragging, setDragging] = useState<string>();
  const marker = useRef<HTMLSpanElement>(null);
  const cancel = useRef(() => {});
  const dragged = useRef(false);
  const orderKey = panels.map((panel) => panel.id).join(",");

  useEffect(() => () => cancel.current(), [orderKey, enabled, connected]);
  useEffect(() => {
    if (!enabled || !connected) {
      setMenu(undefined);
      setRename(undefined);
    }
  }, [enabled, connected]);

  const beginRename = (panel: PanelTab, anchor: HTMLElement) => {
    if (panel.kind === "terminal" && connected) setRename({ id: panel.id, name: panel.title, anchor });
  };
  const move = (id: string, direction: -1 | 1) => {
    const target = panels[panels.findIndex((panel) => panel.id === id) + direction];
    if (target) moveWorkbenchPanel(id, target.id, direction < 0 ? "before" : "after");
  };

  const tabProps = (panel: PanelTab): HTMLAttributes<HTMLDivElement> & {
    "data-panel-id": string;
    "data-dragging": boolean;
  } => ({
    "data-panel-id": panel.id,
    "data-dragging": dragging === panel.id,
    onPointerDown: (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[role="tab"]')) return;
      cancel.current();
      dragged.current = false;
      const list = strip.current;
      if (!connected || !enabled || !list || panels.length < 2 || !canStartPointerDrag(event)) return;
      const source = event.currentTarget;
      const origin = event.clientX;
      const sourceBounds = source.getBoundingClientRect();
      const scale = sourceBounds.width / source.offsetWidth;
      const initialScroll = list.scrollLeft;
      let current: TabDrop | undefined;
      cancel.current = followPointerDrag(event, source, {
        begin: () => setDragging(panel.id),
        step: ({ x, y }) => {
          const bounds = list.getBoundingClientRect();
          const inside = y >= bounds.top - 24 && y <= bounds.bottom + 24;
          let distance = 0;
          if (inside && x < bounds.left + 32) distance = x - bounds.left - 32;
          else if (inside && x > bounds.right - 32) distance = x - bounds.right + 32;
          const previousScroll = list.scrollLeft;
          if (distance) list.scrollLeft += Math.max(-12, Math.min(12, distance * 0.3));
          const targets = Array.from(list.querySelectorAll<HTMLElement>("[data-panel-id]")).filter((element) => element !== source);
          const before = targets.find((element) => {
            const rect = element.getBoundingClientRect();
            return x < rect.left + rect.width / 2;
          });
          const target = before ?? targets.at(-1);
          current = inside && target ? { id: target.dataset.panelId!, edge: before ? "before" : "after" } : undefined;
          const targetBounds = target?.getBoundingClientRect();
          const left = Math.max(bounds.left, Math.min(sourceBounds.left + x - origin, bounds.right - sourceBounds.width));
          source.style.transform = `translateX(${(left - sourceBounds.left) / scale + list.scrollLeft - initialScroll}px)`;
          if (marker.current) {
            marker.current.hidden = !current;
            if (targetBounds) {
              const position = (before ? targetBounds.left : targetBounds.right) - bounds.left;
              marker.current.style.transform = `translateX(${Math.max(0, position / scale + list.scrollLeft - 1)}px)`;
            }
          }
          return previousScroll !== list.scrollLeft;
        },
        end: (commit) => {
          source.style.removeProperty("transform");
          if (marker.current) marker.current.hidden = true;
          dragged.current = true;
          if (commit && current) moveWorkbenchPanel(panel.id, current.id, current.edge);
          setDragging(undefined);
        },
      });
    },
    onClickCapture: (event) => {
      if (!dragged.current || event.detail === 0) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onDoubleClick: (event) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
      if (anchor) beginRename(panel, anchor);
    },
    onContextMenu: (event) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
      if (!anchor) return;
      event.preventDefault();
      setMenu({ id: panel.id, anchor });
    },
    onKeyDown: (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="tab"]')) return;
      if (event.key === "F2" && panel.kind === "terminal") {
        event.preventDefault();
        event.stopPropagation();
        beginRename(panel, event.target);
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        move(panel.id, event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        event.stopPropagation();
        setMenu({ id: panel.id, anchor: event.target });
      }
    },
  });

  const menuPanel = panels.find((panel) => panel.id === menu?.id);
  const menuIndex = panels.findIndex((panel) => panel.id === menu?.id);
  const name = rename?.name.trim() ?? "";
  const canRename = connected && name.length > 0 && name.length <= 100;
  const overlays = <>
    {menu && menuPanel && <Menu
      key={menu.id}
      anchor={menu.anchor}
      onClose={() => setMenu(undefined)}
      items={[
        ...(menuPanel.kind === "terminal" ? [{
          id: "rename", label: t("Rename terminal"), hint: "F2", icon: <Pencil size={15} />, disabled: !connected,
          onSelect: () => { setMenu(undefined); beginRename(menuPanel, menu.anchor); },
        }] : []),
        {
          id: "left", label: t("Move tab left"), hint: "Alt+←", icon: <ArrowLeft size={15} />, disabled: !connected || menuIndex === 0,
          onSelect: () => { move(menuPanel.id, -1); menu.anchor.focus({ preventScroll: true }); },
        },
        {
          id: "right", label: t("Move tab right"), hint: "Alt+→", icon: <ArrowRight size={15} />, disabled: !connected || menuIndex === panels.length - 1,
          onSelect: () => { move(menuPanel.id, 1); menu.anchor.focus({ preventScroll: true }); },
        },
        { id: "close", label: t("Close {name}", { name: menuPanel.title }), icon: <X size={15} />, disabled: !connected, onSelect: () => send({ t: "panel.close", id: menuPanel.id }) },
      ]}
    />}
    {rename && panels.some((panel) => panel.id === rename.id) && <Modal
      title={t("Rename terminal")}
      initialFocus="input"
      returnFocus={rename.anchor}
      onClose={() => setRename(undefined)}
      onSubmit={() => {
        if (!canRename) return;
        send({ t: "panel.rename", id: rename.id, title: name });
        setRename(undefined);
      }}
      footer={<>
        <button type="button" className="btn" data-cancel onClick={() => setRename(undefined)}>{t("Cancel")}</button>
        <button type="submit" className="btn" data-variant="primary" disabled={!canRename}>{t("Save")}</button>
      </>}
    >
      <label className="feature-field">
        <span>{t("Name")}</span>
        <input value={rename.name} maxLength={100} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRename({ ...rename, name: event.target.value })} />
      </label>
    </Modal>}
  </>;

  const indicator = <span ref={marker} className="panel-drop-marker" aria-hidden="true" hidden />;
  return { tabProps, overlays, indicator, orderKey };
}
