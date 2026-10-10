import type { ProviderInfo } from "../../../../shared/protocol.ts";
import type { ProviderSignIn, SignInFlow } from "../../../../shared/provider-settings.ts";
import { ActionError } from "../ActionError.tsx";
import { CheckIcon, MoreIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { Menu, type MenuItem } from "../Menu.tsx";
import { BrowserSignInSteps } from "./BrowserSignInSteps.tsx";
import { TerminalSignIn } from "./TerminalSignIn.tsx";
import { useAccountSignIn } from "./use-account-sign-in.ts";
import { isFlowActive } from "./use-provider-sign-ins.ts";

export interface Account {
  id?: string;
  name: string;
  available: boolean;
  modelCount: number;
}

const FLOW_LABELS: Record<SignInFlow["status"], string> = {
  starting: "Starting sign-in…",
  waiting: "Waiting for you to approve access",
  verifying: "Checking your account…",
  failed: "Sign-in failed",
};

function statusText(account: Account, status: ProviderSignIn | undefined): string {
  if (!account.available) return "Not installed";
  if (!status) return "Checking sign-in…";
  if (status.signedIn) return account.modelCount === 1 ? "Signed in · 1 model" : `Signed in · ${account.modelCount} models`;
  if (status.flow) return FLOW_LABELS[status.flow.status];
  return "Not signed in";
}

export function AccountRow({ provider, account, status, terminalOpen, disabled, menu = [], use, onOpenTerminal, onCloseTerminal, onChange }: {
  provider: ProviderInfo;
  account: Account;
  status?: ProviderSignIn;
  terminalOpen: boolean;
  disabled: boolean;
  menu?: MenuItem[];
  use?: { active: boolean; onSelect: () => void };
  onOpenTerminal: () => void;
  onCloseTerminal: () => void;
  onChange: () => void;
}) {
  const signIn = useAccountSignIn(provider, account.id, onChange);
  const inApp = provider.signIn === "app";
  const flow = status?.flow;
  const flowActive = isFlowActive(flow);
  const items: MenuItem[] = [
    ...(inApp && status?.signedIn ? [{ id: "sign-out", label: "Sign out", onSelect: () => void signIn.signOut() }] : []),
    ...menu,
  ];
  const error = status?.error ?? flow?.error;

  return (
    <div className="account">
      <div className="account-row">
        <span className="account-avatar" data-signed-in={Boolean(status?.signedIn)} aria-hidden="true">{account.name.trim().charAt(0).toUpperCase()}</span>
        <span className="account-text">
          <strong>{account.name}</strong>
          <small role="status">{flowActive && flow?.status !== "waiting" && <Loader size={12} />}{statusText(account, status)}</small>
        </span>
        <span className="account-actions">
          {status?.signedIn && use && (use.active
            ? <span className="in-use-label"><CheckIcon size={14} />In use</span>
            : <button type="button" className="btn" disabled={disabled} onClick={use.onSelect}>Use</button>)}
          {status?.signedIn || !account.available ? null
            : terminalOpen ? <button type="button" className="btn" onClick={onCloseTerminal}>Cancel</button>
              : flowActive ? <button type="button" className="btn" disabled={disabled || signIn.busy} onClick={() => void signIn.cancel()}>Cancel</button>
                : <button type="button" className="btn" data-variant="primary" disabled={disabled || signIn.busy || !status}
                  onClick={() => inApp ? void signIn.start() : onOpenTerminal()}>Sign in</button>}
          {items.length > 0 && <Menu items={items} align="end" trigger={({ toggle, id, open }) => (
            <button id={id} type="button" className="icon-btn" aria-label={`${account.name} options`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle}><MoreIcon size={16} /></button>
          )} />}
        </span>
      </div>
      {(terminalOpen || flow?.status === "waiting" || error || signIn.error) && (
        <div className="account-body">
          {terminalOpen && <TerminalSignIn provider={provider.id} instanceId={account.id} />}
          {flow?.status === "waiting" && flow.url && <BrowserSignInSteps url={flow.url} busy={signIn.busy} disabled={disabled} onFinish={signIn.finish} />}
          {error && <p className="provider-update-result" data-status="error" role="alert">{error}</p>}
          <ActionError className="provider-update-result" message={signIn.error} onDismiss={signIn.clearError} />
        </div>
      )}
    </div>
  );
}
