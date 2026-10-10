import type { ReactNode } from "react";

export interface CardToggle {
  checked: boolean;
  label: string;
  busy: boolean;
  onChange: () => void;
}

export function SettingsCard({ title, subtitle, description, icon, toggle, onOpen }: {
  title: string;
  subtitle: string;
  description: string;
  icon: ReactNode;
  toggle?: CardToggle;
  onOpen: () => void;
}) {
  return (
    <article className="settings-card">
      <button className="settings-card-open" type="button" aria-haspopup="dialog" onClick={onOpen}>
        {icon}
        <strong>{title}</strong>
        <small>{subtitle}</small>
        <span>{description}</span>
      </button>
      {toggle && <input
        className="setting-switch"
        type="checkbox"
        role="switch"
        aria-label={toggle.label}
        checked={toggle.checked}
        disabled={toggle.busy}
        onChange={toggle.onChange}
      />}
    </article>
  );
}
