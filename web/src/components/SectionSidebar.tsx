import { SelectionHighlight } from "./SelectionHighlight.tsx";
import type { ReactNode } from "react";
import { SlidingPanel } from "./SlidingPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";

export function SectionSidebar({
  title,
  activeItem,
  open,
  children,
}: {
  title: string;
  activeItem: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <SlidingPanel open={open} side="left"><aside className="rail section-rail" aria-label={title}>
      <nav className="section-nav scroll sliding-selection" aria-label={`${title} sections`}>
        <SelectionHighlight value={activeItem} />
        {children}
      </nav>
      <ResizeHandle panel="sidebar" />
    </aside></SlidingPanel>
  );
}
