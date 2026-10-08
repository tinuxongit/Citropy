import type { ReactNode } from "react";
import { ChevronDownIcon } from "../icons/chevrons.tsx";
import { Menu, type MenuItem } from "../Menu.tsx";

interface RowProps {
  icon: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function RowContent({ icon, label, hint }: Pick<RowProps, "icon" | "label" | "hint">) {
  return <>{icon}<span className="details-label truncate">{label}</span>{hint && <span className="details-hint">{hint}</span>}</>;
}

export function DetailRow({ icon, label, hint, title, disabled, onClick }: RowProps) {
  if (!onClick) return <div className="details-row" title={title}><RowContent icon={icon} label={label} hint={hint} /></div>;
  return <button type="button" className="details-row" title={title} disabled={disabled} onClick={onClick}><RowContent icon={icon} label={label} hint={hint} /></button>;
}

export function DetailSplitRow({ menu, menuLabel, extra, onMenuOpen, ...primary }: RowProps & { menu: MenuItem[]; menuLabel: string; extra?: ReactNode; onMenuOpen?: () => void }) {
  return (
    <div className="details-split">
      <button type="button" className="details-row" title={primary.title} disabled={primary.disabled} onClick={primary.onClick}>
        <RowContent icon={primary.icon} label={primary.label} hint={primary.hint} />
      </button>
      {extra}
      <span className="details-separator" aria-hidden="true" />
      <Menu items={menu} span=".details-split" align="end" trigger={({ toggle, id, open }) => (
        <button id={id} type="button" className="details-chevron" aria-label={menuLabel} title={menuLabel} aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) onMenuOpen?.(); toggle(); }}><ChevronDownIcon size={14} /></button>
      )} />
    </div>
  );
}
