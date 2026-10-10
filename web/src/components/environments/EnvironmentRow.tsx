import type { ReactNode } from "react";
import { CheckIcon, MoreIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { Menu, type MenuItem } from "../Menu.tsx";

export type RowState = "in-use" | "connecting" | "error" | "idle";

export function EnvironmentRow({ icon, name, detail, status, state, action, menu }: {
  icon: ReactNode;
  name: string;
  detail: string;
  status: string;
  state: RowState;
  action?: { label: string; disabled?: boolean; onClick: () => void };
  menu?: MenuItem[];
}) {
  return (
    <div className="environment-row" data-state={state}>
      <span className="environment-icon" aria-hidden="true">{icon}</span>
      <span className="environment-text">
        <strong>{name}</strong>
        <small>{detail}</small>
        <small className="environment-status" role="status">{state === "connecting" && <Loader size={12} />}{status}</small>
      </span>
      <span className="environment-actions">
        {state === "in-use"
          ? <span className="in-use-label"><CheckIcon size={14} />In use</span>
          : action && <button type="button" className="btn" disabled={action.disabled} onClick={action.onClick}>{action.label}</button>}
        {menu
          ? <Menu items={menu} align="end" trigger={({ toggle, id, open }) => (
            <button id={id} type="button" className="icon-btn" aria-label={`${name} options`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><MoreIcon size={16} /></button>
          )} />
          : <span className="environment-menu-space" />}
      </span>
    </div>
  );
}
