import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloseIcon } from "./icons/marks.tsx";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "./icons/status.tsx";
import { dismissToast, useApp, type Toast } from "../lib/store.ts";
import { readNotifications } from "../lib/actions.ts";
import type { NotificationTarget } from "../../../shared/protocol.ts";

function ToastItem({
  toast,
  onOpen,
}: {
  toast: Toast;
  onOpen: (target: NotificationTarget) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(
      () => dismissToast(toast.id),
      toast.level === "error" ? 10_000 : 6_000,
    );
    return () => clearTimeout(timer);
  }, [toast.id, toast.level, paused]);
  const Icon =
    toast.level === "success"
      ? CircleCheckIcon
      : toast.level === "info"
        ? InfoIcon
        : CircleAlertIcon;
  return (
    <motion.div
      className="toast"
      data-level={toast.level}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.16 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role={toast.level === "error" ? "alert" : "status"}
    >
      <span className="toast-symbol">
        <Icon size={18} />
      </span>
      <div className="toast-copy">
        {toast.title && <strong>{toast.title}</strong>}
        <span className="toast-text">{toast.text}</span>
        {toast.target && (
          <button
            className="toast-open"
            type="button"
            onClick={() => {
              readNotifications([toast.id]);
              onOpen(toast.target!);
              dismissToast(toast.id);
            }}
          >
            {toast.target.view === "chat" ? "Open conversation" : toast.target.view === "git" ? "Open source control" : toast.target.view === "settings" ? "Open settings" : "Open GitHub"}
          </button>
        )}
      </div>
      <button
        className="icon-btn"
        type="button"
        onClick={() => {
          readNotifications([toast.id]);
          dismissToast(toast.id);
        }}
        aria-label="Dismiss notification"
        title="Dismiss notification"
      >
        <CloseIcon size={15} />
      </button>
    </motion.div>
  );
}

export function Toasts({
  onOpen,
}: {
  onOpen: (target: NotificationTarget) => void;
}) {
  const toasts = useApp((state) => state.toasts);
  return (
    <div className="toasts" aria-label="Recent notifications">
      <AnimatePresence initial={false}>
        {toasts.slice(-3).map((toast) => (
          <ToastItem key={toast.id} toast={toast} onOpen={onOpen} />
        ))}
      </AnimatePresence>
    </div>
  );
}
