import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  CheckCheck,
  Check,
  GitBranch,
  Github,
  MessageSquare,
  Trash2,
  X,
  CircleAlert,
  Download,
} from "lucide-react";
import { useApp } from "../lib/store.ts";
import { Inbox } from "./icons.ts";
import { send } from "../lib/socket.ts";
import { ago, dateTime } from "../lib/format.ts";
import type { NotificationTarget } from "../../../shared/protocol.ts";

export function NotificationCenter({
  onOpen,
}: {
  onOpen: (target: NotificationTarget) => void;
}) {
  const reducedMotion = useReducedMotion();
  const notifications = useApp((state) => state.notifications);
  const connected = useApp((state) => state.connected);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const unread = notifications.filter((entry) => !entry.read).length;
  const visible = notifications.filter(
    (entry) => filter === "all" || !entry.read,
  );
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open]);
  return (
    <div
      className="notifications-wrap"
      ref={wrap}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="strip-action notification-trigger"
        title="Notifications"
        aria-label={
          unread ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        data-unread={unread > 0 || undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="strip-action-face">
          <span className="unseen-anchor">
            <Inbox size={18} />
            {unread > 0 && <span className="unseen-dot" />}
          </span>
        </span>
      </button>
      <AnimatePresence>{open && (
        <motion.section initial={{ opacity: 0, x: reducedMotion ? 0 : -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : -4, pointerEvents: "none" }} transition={{ duration: reducedMotion ? 0 : 0.16 }}
          className="notification-center"
          role="dialog"
          aria-label="Notifications"
        >
          <header>
            <div
              className="notification-filters sliding-selection"
              role="group"
              aria-label="Filter notifications"
            >
              <SelectionHighlight value={filter} />
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >All activity</button>
              <button
                type="button"
                aria-pressed={filter === "unread"}
                onClick={() => setFilter("unread")}
              >Unread{unread > 0 && <span>{unread}</span>}
              </button>
            </div>
            <button
              className="icon-btn"
              type="button"
              aria-label="Mark all read"
              title="Mark all read"
              disabled={!unread || !connected}
              onClick={() => send({ t: "notifications.read" })}
            >
              <CheckCheck size={17} />
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="Close notifications"
              title="Close notifications"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </header>
          <div className="notification-list scroll">
            {visible.map((entry) => {
              const Icon =
                entry.level === "error"
                  ? CircleAlert
                  : entry.kind === "git"
                    ? GitBranch
                    : entry.kind === "github"
                      ? Github
                      : entry.kind === "update" ? Download : MessageSquare;
              return (
                <article
                  key={entry.id}
                  className="notification-row"
                  data-unread={!entry.read}
                >
                  <span
                    className="notification-symbol"
                    data-level={entry.level}
                  >
                    <Icon size={17} />
                  </span>
                  <button
                    type="button"
                    className="notification-copy"
                    onClick={() => {
                      send({ t: "notifications.read", ids: [entry.id] });
                      onOpen(entry.target);
                      setOpen(false);
                    }}
                  >
                    <strong>{entry.title}</strong>
                    <span>{entry.kind === "update" ? `${entry.text} is available. Open settings to update when you're ready.` : entry.text}</span>
                    <time
                      dateTime={new Date(entry.createdAt).toISOString()}
                      title={dateTime(entry.createdAt)}
                    >
                      {ago(entry.createdAt)}
                    </time>
                  </button>
                  {!entry.read && (
                    <button
                      type="button"
                      className="icon-btn notification-read"
                      aria-label="Mark read"
                      title="Mark read"
                      disabled={!connected}
                      onClick={() =>
                        send({ t: "notifications.read", ids: [entry.id] })
                      }
                    >
                      <Check size={14} />
                    </button>
                  )}
                </article>
              );
            })}
            {!visible.length && (
              <div className="notification-empty">
                <BellRing size={27} />
                <strong>
                  {filter === "unread" ? "All caught up" : "Nothing here yet"}
                </strong>
                <p>Chat replies, updates, and completed Git or GitHub actions will appear here.</p>
              </div>
            )}
          </div>
          <footer>
            <span>Last 100 notifications</span>
            <button
              type="button"
              disabled={
                !connected || !notifications.some((entry) => entry.read)
              }
              onClick={() => send({ t: "notifications.clear" })}
            >
              <Trash2 size={13} />Clear read</button>
          </footer>
        </motion.section>
      )}</AnimatePresence>
    </div>
  );
}
