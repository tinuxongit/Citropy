import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { CheckCheckIcon, CheckIcon, CloseIcon } from "./icons/marks.tsx";
import { TrashIcon } from "./icons/actions.tsx";
import { CircleAlertIcon } from "./icons/status.tsx";
import { DownloadIcon } from "./icons/arrows.tsx";
import { useApp } from "../lib/store.ts";
import { send } from "../lib/socket.ts";
import { ago, dateTime, day } from "../lib/format.ts";
import { ConversationsIcon } from "./ConversationsIcon.tsx";
import { GitHubIcon, GitIcon } from "./BrandIcon.tsx";
import { InboxIcon } from "./InboxIcon.tsx";
import type { AppNotification, NotificationTarget } from "../../../shared/protocol.ts";

type Kind = AppNotification["kind"];

interface InboxTab {
  id: string;
  label: string;
  kinds?: Kind[];
  empty: string;
}

const TABS: InboxTab[] = [
  { id: "all", label: "All", empty: "Chat replies, updates, and finished Git or GitHub actions will appear here." },
  { id: "chat", label: "Chats", kinds: ["chat"], empty: "Replies and questions from your conversations will appear here." },
  { id: "code", label: "Code", kinds: ["git", "github"], empty: "Finished commits, pushes, and GitHub actions will appear here." },
  { id: "update", label: "Updates", kinds: ["update"], empty: "New versions of Citropy and your coding tools will appear here." },
];

const KIND_ICONS: Record<Kind, ComponentType<{ size?: number }>> = {
  chat: ConversationsIcon,
  git: GitIcon,
  github: GitHubIcon,
  update: DownloadIcon,
};

function inTab(tab: InboxTab, entry: AppNotification) {
  return !tab.kinds || tab.kinds.includes(entry.kind);
}

function byDay(entries: AppNotification[]) {
  const groups = new Map<string, AppNotification[]>();
  for (const entry of entries) {
    const label = day(entry.createdAt);
    const group = groups.get(label);
    if (group) group.push(entry);
    else groups.set(label, [entry]);
  }
  return [...groups];
}

export function NotificationCenter({
  onOpen,
}: {
  onOpen: (target: NotificationTarget) => void;
}) {
  const reducedMotion = useReducedMotion();
  const notifications = useApp((state) => state.notifications);
  const connected = useApp((state) => state.connected);
  const [open, setOpen] = useState(false);
  const [tabId, setTabId] = useState(TABS[0]!.id);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const tab = TABS.find((entry) => entry.id === tabId)!;
  const unread = notifications.filter((entry) => !entry.read).length;
  const tabUnread = notifications.filter((entry) => !entry.read && inTab(tab, entry));
  const visible = notifications.filter((entry) => inTab(tab, entry) && (!unreadOnly || !entry.read));
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
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
        title="Inbox"
        aria-label={
          unread ? `Inbox, ${unread} unread` : "Inbox"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        data-unread={unread > 0 || undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="strip-action-face">
          <span className="unseen-anchor">
            <InboxIcon size={18} />
            {unread > 0 && <span className="unseen-dot" />}
          </span>
        </span>
      </button>
      <AnimatePresence>{open && (
        <motion.section initial={{ opacity: 0, x: reducedMotion ? 0 : -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : -4, pointerEvents: "none" }} transition={{ duration: reducedMotion ? 0 : 0.16 }}
          className="notification-center"
          role="dialog"
          aria-label="Inbox"
        >
          <header>
            <h2>Inbox</h2>
            {unread > 0 && <span className="notification-badge">{unread} new</span>}
            <button
              type="button"
              className="notification-unread-toggle"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly(!unreadOnly)}
            >Unread only</button>
            <button
              className="icon-btn"
              type="button"
              aria-label="Mark all read"
              title="Mark all read"
              disabled={!tabUnread.length || !connected}
              onClick={() => send({ t: "notifications.read", ids: tabUnread.map((entry) => entry.id) })}
            >
              <CheckCheckIcon size={16} />
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="Close notifications"
              title="Close notifications"
              onClick={close}
            >
              <CloseIcon size={16} />
            </button>
          </header>
          <div className="segmented-tabs notification-tabs sliding-selection" role="tablist" aria-label="Notification types">
            <SelectionHighlight value={tabId} />
            {TABS.map((entry) => {
              const count = notifications.filter((item) => !item.read && inTab(entry, item)).length;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`${id}-${entry.id}`}
                  aria-selected={entry.id === tabId}
                  aria-controls={`${id}-panel`}
                  onClick={() => setTabId(entry.id)}
                >
                  {entry.label}
                  {count > 0 && <span>{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="notification-list scroll" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tabId}`}>
            {byDay(visible).map(([label, entries]) => (
              <section className="notification-day" key={label} aria-label={label}>
                <h3>{label}</h3>
                {entries.map((entry) => {
                  const Icon = entry.level === "error" ? CircleAlertIcon : KIND_ICONS[entry.kind];
                  return (
                    <article
                      key={entry.id}
                      className="notification-row"
                      data-unread={!entry.read}
                    >
                      <span className="notification-symbol" data-level={entry.level}>
                        <Icon size={16} />
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
                          <CheckIcon size={14} />
                        </button>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}
            {!visible.length && (
              <div className="notification-empty">
                <span className="notification-empty-art"><InboxIcon size={28} /></span>
                <strong>{unreadOnly ? "All caught up" : "Nothing here yet"}</strong>
                <p>{tab.empty}</p>
              </div>
            )}
          </div>
          <footer>
            <span>Last 100 items</span>
            <button
              type="button"
              disabled={
                !connected || !notifications.some((entry) => entry.read)
              }
              onClick={() => send({ t: "notifications.clear" })}
            >
              <TrashIcon size={13} />Clear read</button>
          </footer>
        </motion.section>
      )}</AnimatePresence>
    </div>
  );
}
