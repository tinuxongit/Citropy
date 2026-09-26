import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const HOVER_DELAY = 500;
const LEAVE_DELAY = 120;

export type ThreadPreviewControls = ReturnType<typeof useThreadPreview>["controls"];

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

  const latest = useRef({ shown, disabled });
  latest.current = { shown, disabled };

  const leave = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(hide, LEAVE_DELAY);
  }, [clearTimer, hide]);
  const show = useCallback((anchor: HTMLButtonElement, environment: string, threadId: string, immediate = false) => {
    clearTimer();
    const current = latest.current;
    if ((current.shown?.environment === environment && current.shown.threadId === threadId) || current.disabled) return;
    setShown(undefined);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (anchor.isConnected && (anchor.matches(":hover") || anchor.matches(":focus-visible"))) setShown({ environment, threadId, anchor });
    }, immediate ? 0 : HOVER_DELAY);
  }, [clearTimer]);

  const controls = useMemo(() => ({ show, leave, hide, clearTimer }), [show, leave, hide, clearTimer]);
  return {
    id,
    shown,
    controls,
    describedBy: (environment: string, threadId: string) => shown?.environment === environment && shown.threadId === threadId ? id : undefined,
  };
}
