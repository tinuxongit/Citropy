import { SelectionHighlight } from "./SelectionHighlight.tsx";
import type { LucideIcon } from "lucide-react";
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

export function SectionLink({
  icon: Icon,
  label,
  active,
  disabled,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      className="section-link"
      type="button"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onSelect}
    >
      <Icon size={17} />
      <span>{label}</span>
      {children}
    </button>
  );
}
