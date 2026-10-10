import { useRef, useState } from "react";
import { PinIcon } from "./icons/actions.tsx";
import { CloseIcon, PlusIcon } from "./icons/marks.tsx";
import { useApp } from "../lib/store.ts";
import { closeTab, createThread, keepTab, moveTab, showThread } from "../lib/actions.ts";
import { Menu } from "./Menu.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { useTabDrag } from "./use-tab-drag.tsx";

const MIDDLE_BUTTON = 1;

export function ThreadTabs() {
  const threads = useApp((state) => state.threads);
  const openThreadIds = useApp((state) => state.openThreadIds);
  const activeThreadId = useApp((state) => state.activeThreadId);
  const previewThreadId = useApp((state) => state.previewThreadId);
  const canCreate = useApp((state) => state.connected && !state.creatingThread && Boolean(state.activeProjectId));
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement }>();
  const open = openThreadIds.flatMap((id) => threads[id] ?? []);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useTabDrag({ strip, enabled: true, resetKey: openThreadIds.join(","), onMove: moveTab });

  return (
    <div ref={strip} className="thread-tabs" role="group" aria-label="Conversation tabs">
      {open.map((thread) => (
        <div
          key={thread.id}
          className="thread-tab"
          data-tab-id={thread.id}
          data-active={thread.id === activeThreadId || undefined}
          data-preview={thread.id === previewThreadId || undefined}
          data-dragging={drag.dragging === thread.id}
          onPointerDown={(event) => { if (event.target instanceof Element && event.target.closest(".thread-tab-open")) drag.start(event, thread.id); }}
          onClickCapture={drag.suppressClickAfterDrag}
          onAuxClick={(event) => { if (event.button === MIDDLE_BUTTON) closeTab(thread.id); }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ id: thread.id, anchor: event.currentTarget });
          }}
        >
          <button
            type="button"
            className="thread-tab-open"
            aria-current={thread.id === activeThreadId ? "page" : undefined}
            title={thread.title}
            onClick={() => showThread(thread.id)}
            onDoubleClick={() => keepTab(thread.id)}
          >
            <ProviderIcon provider={thread.provider} />
            <span className="truncate">{thread.title}</span>
          </button>
          <button type="button" className="thread-tab-close" aria-label={`Close ${thread.title}`} onClick={() => closeTab(thread.id)}>
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="thread-tabs-new" disabled={!canCreate} aria-label="New thread" title="New thread" onClick={() => void createThread()}>
        <PlusIcon size={15} />
      </button>
      {menu && <Menu
        key={menu.id}
        anchor={menu.anchor}
        onClose={() => setMenu(undefined)}
        items={[
          ...(menu.id === previewThreadId ? [{ id: "keep", label: "Keep tab open", icon: <PinIcon size={15} />, onSelect: () => keepTab(menu.id) }] : []),
          { id: "close", label: "Close tab", icon: <CloseIcon size={15} />, onSelect: () => closeTab(menu.id) },
        ]}
      />}
    </div>
  );
}
