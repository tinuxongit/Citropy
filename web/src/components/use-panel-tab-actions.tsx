import { useEffect, useState, type HTMLAttributes, type RefObject } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons/arrows.tsx";
import { EditIcon } from "./icons/pencil.tsx";
import { CloseIcon } from "./icons/marks.tsx";
import type { PanelTab } from "../../../shared/workbench.ts";
import { moveWorkbenchPanel } from "../lib/actions.ts";
import { opensContextMenu } from "../lib/context-menu-key.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { Menu } from "./Menu.tsx";
import { Modal } from "./Modal.tsx";
import { useTabDrag } from "./use-tab-drag.tsx";

type TabAnchor = { id: string; anchor: HTMLElement };

export function usePanelTabActions(panels: PanelTab[], strip: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const connected = useApp((state) => state.connected);
  const [menu, setMenu] = useState<TabAnchor>();
  const [rename, setRename] = useState<TabAnchor & { name: string }>();
  const orderKey = panels.map((panel) => panel.id).join(",");
  const drag = useTabDrag({ strip, enabled: enabled && connected, resetKey: orderKey, onMove: moveWorkbenchPanel });
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
    "data-tab-id": string;
    "data-dragging": boolean;
  } => ({
    "data-tab-id": panel.id,
    "data-dragging": drag.dragging === panel.id,
    onPointerDown: (event) => {
      if (event.target instanceof Element && event.target.closest('[role="tab"]')) drag.start(event, panel.id);
    },
    onClickCapture: drag.suppressClickAfterDrag,
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
      } else if (opensContextMenu(event)) {
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
          id: "rename", label: "Rename terminal", hint: "F2", icon: <EditIcon size={15} />, disabled: !connected,
          onSelect: () => { setMenu(undefined); beginRename(menuPanel, menu.anchor); },
        }] : []),
        {
          id: "left", label: "Move tab left", hint: "Alt+←", icon: <ArrowLeftIcon size={15} />, disabled: !connected || menuIndex === 0,
          onSelect: () => { move(menuPanel.id, -1); menu.anchor.focus({ preventScroll: true }); },
        },
        {
          id: "right", label: "Move tab right", hint: "Alt+→", icon: <ArrowRightIcon size={15} />, disabled: !connected || menuIndex === panels.length - 1,
          onSelect: () => { move(menuPanel.id, 1); menu.anchor.focus({ preventScroll: true }); },
        },
        { id: "close", label: `Close ${menuPanel.title}`, icon: <CloseIcon size={15} />, disabled: !connected, onSelect: () => send({ t: "panel.close", id: menuPanel.id }) },
      ]}
    />}
    {rename && panels.some((panel) => panel.id === rename.id) && <Modal
      title="Rename terminal"
      initialFocus="input"
      returnFocus={rename.anchor}
      onClose={() => setRename(undefined)}
      onSubmit={() => {
        if (!canRename) return;
        send({ t: "panel.rename", id: rename.id, title: name });
        setRename(undefined);
      }}
      footer={<>
        <button type="button" className="btn" data-cancel onClick={() => setRename(undefined)}>Cancel</button>
        <button type="submit" className="btn" data-variant="primary" disabled={!canRename}>Save</button>
      </>}
    >
      <label className="feature-field">
        <span>Name</span>
        <input value={rename.name} maxLength={100} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRename({ ...rename, name: event.target.value })} />
      </label>
    </Modal>}
  </>;

  return { tabProps, overlays, orderKey };
}
