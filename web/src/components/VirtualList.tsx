import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useApp } from "../lib/store.ts";

export function VirtualList<T>({
  items,
  itemKey,
  estimateSize,
  gap = 0,
  className = "",
  children,
}: {
  items: T[];
  itemKey: keyof T;
  estimateSize: number;
  gap?: number;
  className?: string;
  children: (item: T) => ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scale = useApp((state) => state.uiScale / 100);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string>();
  const virtualized = items.length > 40;
  const focusedIndex = focusedKey === undefined ? -1 : items.findIndex((item) => String(item[itemKey]) === focusedKey);
  const getItemKey = useCallback((index: number) => String(items[index]![itemKey]), [items, itemKey]);
  const list = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: items.length,
    enabled: virtualized,
    getScrollElement: () => host.current?.parentElement?.closest<HTMLElement>(".scroll") ?? null,
    getItemKey,
    estimateSize: () => estimateSize * scale,
    gap: gap * scale,
    scrollMargin,
    overscan: 4,
    measureElement: (element) => element.offsetHeight,
    rangeExtractor: useCallback((range: Range) => [...new Set([
      ...defaultRangeExtractor(range),
      ...[focusedIndex - 1, focusedIndex, focusedIndex + 1].filter(
        (index) => focusedIndex >= 0 && index >= 0 && index < range.count,
      ),
    ])].sort((a, b) => a - b), [focusedIndex]),
  });

  useLayoutEffect(() => {
    if (!virtualized || !host.current) return;
    const element = host.current;
    const scroll = element.parentElement?.closest<HTMLElement>(".scroll");
    if (!scroll) return;
    const measure = () => {
      const margin = element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - scroll.clientTop;
      setScrollMargin(margin);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      observer.observe(parent);
      if (parent === scroll) break;
    }
    return () => observer.disconnect();
  }, [virtualized]);

  const virtualItems = list.getVirtualItems();
  const visibleItems = !virtualized ? items.map((_, index) => ({
    index,
    key: getItemKey(index),
    start: 0,
  })) : virtualItems.length || focusedIndex < 0 ? virtualItems : [{
    index: focusedIndex,
    key: getItemKey(focusedIndex),
    start: scrollMargin + focusedIndex * (estimateSize + gap) * scale,
  }];

  return (
    <div
      ref={host}
      className={`virtual-list ${className}`}
      data-virtualized={virtualized}
      style={virtualized ? { height: list.getTotalSize() } : undefined}
      onFocusCapture={(event) => {
        const row = event.target.closest<HTMLElement>("[data-virtual-key]");
        setFocusedKey(row?.dataset.virtualKey);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedKey(undefined);
      }}
    >
      {visibleItems.map((item) => (
        <div
          className="virtual-list-row"
          key={item.key}
          data-index={item.index}
          data-virtual-key={item.key}
          ref={virtualized ? list.measureElement : undefined}
          style={virtualized ? { transform: `translateY(${item.start - scrollMargin}px)` } : undefined}
        >
          {children(items[item.index]!)}
        </div>
      ))}
    </div>
  );
}
