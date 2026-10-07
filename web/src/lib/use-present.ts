import { useLayoutEffect, useState, type RefObject } from "react";

export function usePresent(open: boolean, element: RefObject<HTMLElement | null>): boolean {
  const [present, setPresent] = useState(open);
  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const exiting = element.current?.getAnimations() ?? [];
    let current = true;
    Promise.all(exiting.map((animation) => animation.finished)).then(
      () => { if (current) setPresent(false); },
      (error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) throw error; },
    );
    return () => { current = false; };
  }, [open, element]);
  return open || present;
}
