import { useCallback, useEffect, useId, useRef, useState } from "react";

const HOVER_DELAY = 500;
const LEAVE_DELAY = 120;

export type ThreadPreviewControls = ReturnType<typeof useThreadPreview>;

export function useThreadPreview({ disabled, resetKey }: { disabled: boolean; resetKey: string }) {
  const [shown, setShown] = useState<{ environment: string; threadId: string; anchor: HTMLButtonElement }>();
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const hide = useCallback(() => {
    clearTimer();
    setShown(undefined);
  }, [clearTimer]);
  useEffect(() => {
    hide();
    return clearTimer;
  }, [resetKey, hide, clearTimer]);

  const leave = () => {
    clearTimer();
    timer.current = setTimeout(hide, LEAVE_DELAY);
  };
  const show = (anchor: HTMLButtonElement, environment: string, threadId: string, immediate = false) => {
    clearTimer();
    if ((shown?.environment === environment && shown.threadId === threadId) || disabled) return;
    setShown(undefined);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (anchor.isConnected && (anchor.matches(":hover") || anchor.matches(":focus-visible"))) setShown({ environment, threadId, anchor });
    }, immediate ? 0 : HOVER_DELAY);
  };
  const describedBy = (environment: string, threadId: string) => shown?.environment === environment && shown.threadId === threadId ? id : undefined;

  return { id, shown, show, leave, hide, clearTimer, describedBy };
}
