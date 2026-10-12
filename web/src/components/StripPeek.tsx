import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";

export function StripPeek({ anchor, open, className, children, ...card }: HTMLAttributes<HTMLDivElement> & {
  anchor: HTMLElement | null | undefined;
  open: boolean;
  className: string;
}) {
  const peek = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  useLayoutEffect(() => {
    const element = peek.current;
    if (!element || !anchor) return;
    if (!element.matches(":popover-open")) element.showPopover();
    if (!open) return;
    const place = () => {
      const strip = anchor.closest(".navigation-strip")!.getBoundingClientRect();
      const target = anchor.getBoundingClientRect();
      const height = element.offsetHeight;
      const edge = parseFloat(getComputedStyle(element).getPropertyValue("--strip-peek-edge"));
      const inLowerHalf = target.top + target.height / 2 > innerHeight / 2;
      const top = Math.max(edge, Math.min(inLowerHalf ? target.bottom - height : target.top, innerHeight - edge - height));
      element.style.setProperty("--strip-peek-left", `${strip.right}px`);
      element.style.setProperty("--strip-peek-top", `${top}px`);
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(element);
    return () => resize.disconnect();
  }, [anchor, open, opened]);
  if (!opened || !anchor) return null;
  return (
    <div ref={peek} className={`strip-peek ${className}`} popover="manual" data-open={open || undefined}>
      <div className="strip-peek-card" {...card}>{children}</div>
    </div>
  );
}
