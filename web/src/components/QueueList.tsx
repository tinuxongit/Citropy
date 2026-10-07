import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChevronUp, Clock3, Paperclip } from "lucide-react";
import { Pencil, X } from "./icons.ts";
import { editQueued } from "../lib/actions.ts";
import { isDevFake, moveFakeQueued } from "../lib/dev-triggers.ts";
import { reportError } from "../lib/api.ts";
import { flushHeld, takeHeld } from "../lib/offline.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { ComposerPopover } from "./composer/ComposerPopover.tsx";
import { ComposerTab } from "./composer/ComposerTab.tsx";
import type {
  ProviderInfo,
  QueuedMessage,
  ThreadMeta,
} from "../../../shared/protocol.ts";

const COMMAND = /^\/[\w.:-]+(?:\s|$)/;
const NONE: QueuedMessage[] = [];

export function QueueList({
  thread,
  provider,
  onEdit,
}: {
  thread: ThreadMeta;
  provider?: ProviderInfo;
  onEdit: (item: QueuedMessage) => void;
}) {
  const connected = useApp((state) => state.connected);
  const held = useApp((state) => state.offline[thread.id] ?? NONE);
  const queued = thread.queue ?? NONE;
  const count = queued.length + held.length;
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!count) setExpanded(false);
  }, [count]);
  const close = () => {
    setExpanded(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const state = !connected
      ? "Sends when Citropy reconnects"
    : queued.length && thread.running
      ? `Sends when ${provider?.label ?? "the provider"} finishes`
      : queued.length
        ? "Paused until the next reply finishes"
        : "Not sent yet";
  const steer = Boolean(
    thread.running && !thread.compacting && provider?.capabilities?.steer,
  );
  const queueEvent = (event: { t: "queue.send" | "queue.remove"; threadId: string; id: string } | { t: "queue.move"; threadId: string; id: string; index: number }) =>
    isDevFake(event.id) ? moveFakeQueued(event.threadId, event.id, event.t === "queue.move" ? event.index : undefined) : send(event);
  const edit = (item: QueuedMessage) => {
    if (isDevFake(item.id)) { moveFakeQueued(thread.id, item.id); onEdit(item); return; }
    return editQueued(thread.id, item.id)
      .then(() => onEdit(item))
      .catch(reportError);
  };
  const editHeld = (id: string) => {
    try {
      onEdit(takeHeld(thread.id, id));
    } catch (error) {
      reportError(error);
    }
  };
  const removeHeld = (id: string) => {
    try {
      takeHeld(thread.id, id);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <>
      <AnimatePresence>{count > 0 && <ComposerTab
        key="queue"
        ref={trigger}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={id}
        aria-label={`${count} ${count === 1 ? "queued message" : "queued messages"}`}
        title={state}
        onClick={() => setExpanded((value) => !value)}
      >
        <Clock3 size={13} />
        Queued
        <span>{count}</span>
      </ComposerTab>}</AnimatePresence>
      <AnimatePresence>{expanded && <ComposerPopover id={id} label="Queued messages" className="composer-queue-panel" anchor={trigger} width={460} onClose={close}>
        <ol className="composer-queue-list scroll" aria-label="Queued messages">
          {queued.map((item, index) => (
            <li className="composer-queue-item" key={item.id}>
              <span className="composer-queue-position" aria-hidden="true">{index + 1}</span>
              <div className="composer-queue-content"><QueuedText item={item} /></div>
              <div className="composer-queue-actions">
                {(!thread.running ||
                  (steer && !COMMAND.test(item.text.trim()))) && (
                  <button
                    type="button"
                    className="btn composer-queue-send"
                    disabled={!connected}
                    title={thread.running ? (provider?.steerHint ?? "Send now") : "Send this message now."}
                    onClick={() =>
                      queueEvent({
                        t: "queue.send",
                        threadId: thread.id,
                        id: item.id,
                      })
                    }
                  >
                    {thread.running ? "Send now" : "Send"}
                  </button>
                )}
                {index > 0 && (
                  <button
                    type="button"
                    className="icon-btn composer-queue-move"
                    aria-label="Move up"
                    title="Move up"
                    disabled={!connected}
                    onClick={() =>
                      queueEvent({
                        t: "queue.move",
                        threadId: thread.id,
                        id: item.id,
                        index: index - 1,
                      })
                    }
                  >
                    <ChevronUp size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn composer-queue-edit"
                  aria-label="Edit"
                  title="Edit"
                  disabled={!connected}
                  onClick={() => void edit(item)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn composer-queue-remove"
                  aria-label="Remove"
                  title="Remove"
                  disabled={!connected}
                  onClick={() =>
                    queueEvent({
                      t: "queue.remove",
                      threadId: thread.id,
                      id: item.id,
                    })
                  }
                >
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
          {held.map((item, index) => (
            <li className="composer-queue-item" key={item.id}>
              <span className="composer-queue-position" aria-hidden="true">{queued.length + index + 1}</span>
              <div className="composer-queue-content">
                <QueuedText item={item} />
                <span className="composer-queue-note">
                  {connected ? "Not sent" : "Waiting for connection"}
                </span>
              </div>
              <div className="composer-queue-actions">
                {connected && (
                  <button
                    type="button"
                    className="btn composer-queue-send"
                    title="Try sending it again."
                    onClick={() => void flushHeld()}
                  >
                    Send
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn composer-queue-edit"
                  aria-label="Edit"
                  title="Edit"
                  onClick={() => editHeld(item.id)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn composer-queue-remove"
                  aria-label="Remove"
                  title="Remove"
                  onClick={() => removeHeld(item.id)}
                >
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </ComposerPopover>}</AnimatePresence>
    </>
  );
}

function QueuedText({ item }: { item: QueuedMessage }) {
  const files = item.attachments ?? [];
  const names = files.map((file) => file.label).join(", ");
  return (
    <>
      <span className="composer-queue-text truncate" title={item.text}>
        {item.text.trim() || names}
      </span>
      {files.length > 0 && (
        <span className="composer-queue-files" title={names}>
          <Paperclip size={12} />
          {files.length}
        </span>
      )}
    </>
  );
}
