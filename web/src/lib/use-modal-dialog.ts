import { useLayoutEffect, useRef } from "react";
import { useIsPresent } from "motion/react";

export function useModalDialog(initialFocus: string, returnFocus?: HTMLElement | null) {
  const present = useIsPresent();
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!present) return;
    const previous = returnFocus ?? document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected && !document.querySelector("dialog[open]"))
        previous.focus();
    };
  }, [present]);
  return { ref, present };
}
