import { useId, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import { useI18n } from "../lib/i18n.ts";
import { useApp } from "../lib/store.ts";

export function AccountMenu({ open, onOpenChange, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const t = useI18n();
  const id = useId();
  const account = useApp((state) => state.githubAccount);

  return (
    <div className="account-menu" data-open={open || undefined}>
      <div className="account-menu-items" id={id}>{children}</div>
      <button
        type="button"
        className="strip-action account-menu-button"
        aria-label={account?.login ?? t("Account")}
        title={open ? undefined : account?.login ?? t("Account")}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        <span className="strip-action-face">
          {account ? <img className="account-menu-avatar" src={account.avatar_url} alt="" /> : <UserRound size={18} />}
        </span>
      </button>
    </div>
  );
}
