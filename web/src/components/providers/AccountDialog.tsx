import { useState } from "react";
import type { ProviderInfo, ProviderInstance } from "../../../../shared/protocol.ts";
import { api } from "../../lib/api.ts";
import { ActionError } from "../ActionError.tsx";
import { Loader } from "../Loader.tsx";
import { Modal } from "../Modal.tsx";
import { EnvironmentFields, toEnvironment, toVariables } from "./EnvironmentFields.tsx";

export function AccountDialog({ provider, instance, onClose, onSaved }: { provider: ProviderInfo; instance: ProviderInstance; onClose: () => void; onSaved: (instance: ProviderInstance) => void }) {
  const [name, setName] = useState(instance.name);
  const [binary, setBinary] = useState(instance.binary ?? "");
  const [variables, setVariables] = useState(() => toVariables(instance.environment));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved(await api<ProviderInstance>("providers/instances", { method: "POST", body: JSON.stringify({ id: instance.id, provider: provider.id, name, binary: binary.trim() || undefined, environment: toEnvironment(variables) }) }));
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Edit account" description={`${provider.label} account`} busy={busy} onClose={onClose} onSubmit={() => void save()} initialFocus="#provider-account-name" className="account-dialog" footer={<>
      <button className="btn" type="button" data-cancel onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn" data-variant="primary" disabled={busy || !name.trim()}>{busy && <Loader size={14} />}Save</button>
    </>}>
      <label className="feature-field">Name<input id="provider-account-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
      <details className="account-dialog-advanced">
        <summary>Advanced</summary>
        <p className="provider-maintenance-note">These change how Citropy starts {provider.label} for this account. They can't change once a chat uses the account.</p>
        {provider.signIn !== "app" && <label className="feature-field">Program path<input value={binary} spellCheck={false} onChange={event => setBinary(event.target.value)} placeholder={provider.binary} /></label>}
        <EnvironmentFields variables={variables} onChange={setVariables} />
      </details>
      <ActionError className="dialog-error" message={error} onDismiss={() => setError("")} />
    </Modal>
  );
}
