import { useState } from "react";
import type { ProviderInfo } from "../../../../shared/protocol.ts";
import type { ProviderSignIn, SignInFlow } from "../../../../shared/provider-settings.ts";
import { api } from "../../lib/api.ts";
import { confirmAction } from "../../lib/store.ts";
import { ActionError } from "../ActionError.tsx";
import { CheckIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { isFlowActive } from "./use-provider-sign-ins.ts";

const FLOW_LABELS: Record<SignInFlow["status"], string> = {
  starting: "Starting sign-in…",
  waiting: "Waiting for you to approve access",
  verifying: "Checking your account…",
  failed: "Sign-in failed",
};

export function AccountSignIn({ provider, instanceId, status, disabled, onChange }: {
  provider: ProviderInfo;
  instanceId?: string;
  status?: ProviderSignIn;
  disabled: boolean;
  onChange: () => void;
}) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flow = status?.flow;
  const active = isFlowActive(flow);

  const request = async (path: string, method: "POST" | "DELETE", extra: Record<string, string> = {}) => {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify({ provider: provider.id, instanceId, ...extra }) });
      onChange();
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (!await confirmAction({ title: `Sign out of ${provider.label}?`, description: "This stops this account's active conversations.", label: "Sign out", danger: true })) return;
    await request("providers/sign-out", "POST");
  };

  const finish = async () => {
    if (await request("providers/sign-in/address", "POST", { address: address.trim() })) setAddress("");
  };

  return (
    <div className="account-sign-in">
      <div className="account-sign-in-row">
        <span role="status">
          {status?.signedIn ? <><CheckIcon size={14} />Signed in</>
            : flow ? <>{active && flow.status !== "waiting" && <Loader size={14} />}{FLOW_LABELS[flow.status]}</>
              : "Not signed in"}
        </span>
        {status?.signedIn ? (
          <button type="button" className="btn" disabled={disabled || busy} onClick={() => void signOut()}>Sign out</button>
        ) : active ? (
          <button type="button" className="btn" disabled={disabled || busy} onClick={() => void request("providers/sign-in", "DELETE")}>Cancel</button>
        ) : (
          <button type="button" className="btn" data-variant="primary" disabled={disabled || busy || !status} onClick={() => void request("providers/sign-in", "POST")}>Sign in</button>
        )}
      </div>
      {flow?.status === "waiting" && flow.url && (
        <form className="account-sign-in-steps" onSubmit={event => { event.preventDefault(); void finish(); }}>
          <p className="provider-maintenance-note">Open the sign-in page and approve access. When Citropy runs on this computer, it finishes by itself. When it runs on another computer, paste the address your browser ends on.</p>
          <a className="btn" data-variant="primary" href={flow.url} target="_blank" rel="noreferrer noopener">Open Google sign-in</a>
          <label className="feature-field">Address from your browser
            <input value={address} spellCheck={false} autoComplete="off" placeholder="http://127.0.0.1:…" onChange={event => setAddress(event.target.value)} />
          </label>
          <button className="btn" disabled={disabled || busy || !address.trim()}>{busy && <Loader size={14} />}Finish sign-in</button>
        </form>
      )}
      {flow?.error && <p className="provider-update-result" data-status="error" role="alert">{flow.error}</p>}
      {status?.error && <p className="provider-update-result" data-status="error" role="alert">{status.error}</p>}
      <ActionError className="provider-update-result" message={error} onDismiss={() => setError("")} />
    </div>
  );
}
