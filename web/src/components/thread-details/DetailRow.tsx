import { useId, type ReactNode } from "react";
import { ChevronDownIcon } from "../icons/chevrons.tsx";
import { PlusIcon } from "../icons/marks.tsx";
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

export function DetailSection({ icon, title, addLabel, onAdd, addDisabled, children }: { icon: ReactNode; title: string; addLabel: string; onAdd: () => void; addDisabled?: boolean; children: ReactNode }) {
  const heading = useId();
  return (
    <div className="details-section" aria-labelledby={heading}>
      <div className="details-head">
        {icon}
        <h3 id={heading} className="details-title">{title}</h3>
        <button type="button" className="details-add" aria-label={addLabel} title={addLabel} disabled={addDisabled} onClick={onAdd}><PlusIcon size={14} /></button>
      </div>
      <div className="details-children">{children}</div>
    </div>
  );
}

export function DetailActionRow({ actionLabel, actionIcon, onAction, ...primary }: RowProps & { actionLabel: string; actionIcon: ReactNode; onAction: () => void }) {
  return (
    <div className="details-split details-item">
      <button type="button" className="details-row" title={primary.title} disabled={primary.disabled} onClick={primary.onClick}>
        <RowContent icon={primary.icon} label={primary.label} hint={primary.hint} />
      </button>
      <button type="button" className="details-chevron details-item-action" aria-label={actionLabel} title={actionLabel} onClick={onAction}>{actionIcon}</button>
    </div>
  );
}
