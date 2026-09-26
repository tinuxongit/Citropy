import { useLayoutEffect, useRef, useState } from "react";
import { environmentStorage } from "../../lib/environment.ts";
import { useI18n } from "../../lib/i18n.ts";
import { useApp } from "../../lib/store.ts";

export function EditorResizeHandle({ pane }: { pane: "explorer" | "terminal" }) {
  const t = useI18n();
  const handle = useRef<HTMLDivElement>(null);
  const scale = useApp((state) => state.uiScale) / 100;
  const [metrics, setMetrics] = useState({
    horizontal: pane === "terminal",
    reversed: false,
    size: 0,
    minimum: 0,
    maximum: 0,
  });
  const frame = useRef(0);
  const drag = useRef<{
    start: number;
    size: number;
    position: number;
    previous: string;
    property: string;
    horizontal: boolean;
    target: HTMLElement;
  } | null>(null);
  const horizontal = metrics.horizontal;
  const property = `--editor-${pane}-${horizontal ? "height" : "width"}`;
  const direction = pane === "terminal" || metrics.reversed ? -1 : 1;
  const clamp = (size: number) =>
    Math.round(Math.max(metrics.minimum, Math.min(metrics.maximum, size)));
  const save = (size?: number) => {
    const root = handle.current?.parentElement;
    if (size === undefined) root?.style.removeProperty(property);
    else root?.style.setProperty(property, `calc(${size}px * var(--ui-scale))`);
    if (size !== undefined)
      setMetrics((previous) => ({ ...previous, size }));
    if (size === undefined)
      environmentStorage.removeItem(`citropy${property}`);
    else environmentStorage.setItem(`citropy${property}`, String(size));
  };
  const cancel = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const current = drag.current;
    if (!current) return;
    if (current.previous)
      current.target.style.setProperty(current.property, current.previous);
    else current.target.style.removeProperty(current.property);
    handle.current?.setAttribute("aria-valuenow", String(current.size));
    handle.current?.setAttribute("aria-valuetext", t("{count} pixels", { count: current.size }));
    drag.current = null;
    delete document.documentElement.dataset.resizing;
  };

  useLayoutEffect(() => {
    const element = handle.current;
    const root = element?.parentElement;
    const target = pane === "explorer"
      ? element?.previousElementSibling
      : element?.nextElementSibling;
    if (!root || !target) return;
    for (const dimension of ["width", "height"]) {
      const name = `--editor-${pane}-${dimension}`;
      const saved = Number(environmentStorage.getItem(`citropy${name}`));
      if (Number.isFinite(saved) && saved > 0)
        root.style.setProperty(name, `calc(${saved}px * var(--ui-scale))`);
    }
    const measure = () => {
      const flow = getComputedStyle(root).flexDirection;
      const horizontal = pane === "terminal" || flow === "column";
      const reversed = pane === "explorer" && flow === "row-reverse";
      if (drag.current && drag.current.horizontal !== horizontal) cancel();
      if (drag.current) return;
      const dimension = horizontal ? "height" : "width";
      const minimum = pane === "terminal" ? 120 : horizontal ? 96 : 160;
      const reserved = pane === "terminal" ? 240 : horizontal ? 400 : 300;
      const size = Math.round(target.getBoundingClientRect()[dimension] / scale);
      const maximum = Math.max(
        minimum,
        Math.floor(root.getBoundingClientRect()[dimension] / scale - reserved),
      );
      setMetrics((previous) =>
        previous.horizontal === horizontal &&
        previous.reversed === reversed &&
        previous.size === size &&
        previous.minimum === minimum &&
        previous.maximum === maximum
          ? previous
          : { horizontal, reversed, size, minimum, maximum },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(target);
    return () => {
      observer.disconnect();
      cancel();
    };
  }, [pane, scale]);

  return (
    <div
      ref={handle}
      className="editor-resize"
      data-pane={pane}
      role="separator"
      aria-label={t(pane === "explorer" ? "File explorer size" : "Terminal height")}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-valuemin={metrics.minimum}
      aria-valuemax={metrics.maximum}
      aria-valuenow={metrics.size}
      aria-valuetext={t("{count} pixels", { count: metrics.size })}
      title={t("Drag to resize. Double-click or press Enter to reset.")}
      tabIndex={0}
      onDoubleClick={() => save()}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const root = event.currentTarget.parentElement;
        const target = (pane === "explorer"
          ? event.currentTarget.previousElementSibling
          : event.currentTarget.nextElementSibling) as HTMLElement | null;
        if (!root || !target) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const position = horizontal ? event.clientY : event.clientX;
        const property = horizontal ? "flex-basis" : "width";
        drag.current = {
          start: position,
          position,
          size: metrics.size,
          previous: target.style.getPropertyValue(property),
          property,
          horizontal,
          target,
        };
        document.documentElement.dataset.resizing = horizontal ? "row" : "column";
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        current.position = horizontal ? event.clientY : event.clientX;
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          if (drag.current === current) {
            const size = clamp(
              current.size + direction * (current.position - current.start) / scale,
            );
            current.target.style.setProperty(current.property, `${Math.round(size * scale)}px`);
            handle.current?.setAttribute("aria-valuenow", String(size));
            handle.current?.setAttribute("aria-valuetext", t("{count} pixels", { count: size }));
          }
        });
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current) return;
        const position = horizontal ? event.clientY : event.clientX;
        const size = clamp(
          current.size + direction * (position - current.start) / scale,
        );
        cancel();
        save(size);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          cancel();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          save();
          return;
        }
        const decrease = horizontal ? "ArrowUp" : "ArrowLeft";
        const increase = horizontal ? "ArrowDown" : "ArrowRight";
        if (![decrease, increase, "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const step = (event.shiftKey ? 32 : 10) * direction;
        const size = event.key === "Home"
          ? metrics.minimum
          : event.key === "End"
            ? metrics.maximum
            : metrics.size + (event.key === increase ? step : -step);
        save(clamp(size));
      }}
    />
  );
}
