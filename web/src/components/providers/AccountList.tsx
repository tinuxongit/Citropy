import { useState } from "react";
import type { ProviderInfo, ProviderInstance } from "../../../../shared/protocol.ts";
import { activeAccountId } from "../../../../shared/provider-account.ts";
import { api, reportError } from "../../lib/api.ts";
import { send } from "../../lib/socket.ts";
import { confirmAction } from "../../lib/store.ts";
import { ActionError } from "../ActionError.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { AccountRow } from "./AccountRow.tsx";
import { MAIN_ACCOUNT } from "./provider-summary.ts";
import { signInFor, type useTerminalSignIns } from "./use-provider-sign-ins.ts";

type SignIns = ReturnType<typeof useTerminalSignIns>;

export function AccountList({ provider, instances, signIns, disabled, onSaved, onRemoved, onEdit }: {
  provider: ProviderInfo;
  instances: ProviderInstance[];
  signIns: SignIns;
  disabled: boolean;
  onSaved: (instance: ProviderInstance) => void;
  onRemoved: (id: string) => void;
  onEdit: (instance: ProviderInstance) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await api<ProviderInstance>("providers/instances", { method: "POST", body: JSON.stringify({ provider: provider.id, name, environment: {} }) });
      onSaved(saved);
      setAdding(false);
      setName("");
      if (provider.signIn === "app") await api("providers/sign-in", { method: "POST", body: JSON.stringify({ provider: provider.id, instanceId: saved.id }) });
      else signIns.openTerminal({ provider: provider.id, instanceId: saved.id });
      signIns.reload();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (id: string, label: string) => {
    if (!await confirmAction({ title: `Remove ${label}?`, description: "Citropy signs this account out and forgets it. Remove its conversations and writing-model choices first.", label: "Remove account", danger: true })) return;
    try {
      await api("providers/instances", { method: "DELETE", body: JSON.stringify({ id }) });
      onRemoved(id);
    } catch (cause) { reportError(cause); }
  };

  const row = (id: string | undefined, label: string, available: boolean, modelCount: number) => {
    const saved = id ? instances.find(instance => instance.id === id) : undefined;
    return (
      <AccountRow key={id ?? "main"} provider={provider} account={{ id, name: label, available, modelCount }}
        status={signInFor(signIns.signIns, provider.id, id)}
        terminalOpen={signIns.isTerminalOpen(provider.id, id)}
        disabled={disabled}
        onOpenTerminal={() => signIns.openTerminal({ provider: provider.id, instanceId: id })}
        onCloseTerminal={signIns.closeTerminal}
        onChange={signIns.reload}
        use={provider.instances?.length ? { active: activeAccountId(provider) === id, onSelect: () => send({ t: "providers.activeAccount", provider: provider.id, instanceId: id ?? null }) } : undefined}
        menu={id ? [
          { id: "edit", label: "Edit account", disabled: !saved, onSelect: () => saved && onEdit(saved) },
          { id: "remove", label: "Remove account", danger: true, onSelect: () => void remove(id, label) },
        ] : []} />
    );
  };

  return (
    <div className="account-list" role="group" aria-label={`${provider.label} accounts`}>
      {row(undefined, MAIN_ACCOUNT, provider.available, provider.models.length)}
      {provider.instances?.map(instance => row(instance.id, instance.name, instance.available, instance.models.length))}
      {adding ? (
        <div className="account-add" role="group" aria-label="New account">
          <span className="account-avatar" data-placeholder="true" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
          <input autoFocus aria-label="Account name" value={name} maxLength={80} placeholder="Name it, like Work or Personal" disabled={busy}
            onChange={event => setName(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && name.trim() && !busy) { event.preventDefault(); void add(); }
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setAdding(false); }
            }} />
          <span className="account-actions">
            <button type="button" className="btn" data-variant="ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn" data-variant="primary" disabled={busy || disabled || !name.trim()} onClick={() => void add()}>{busy && <Loader size={14} />}Add and sign in</button>
          </span>
          <p className="account-add-note">Each account keeps its own sign-in. New chats use the account marked In use.</p>
        </div>
      ) : (
        <button type="button" className="account-add-button" disabled={disabled} onClick={() => { setError(""); setAdding(true); }}>
          <span className="account-avatar" data-placeholder="true" aria-hidden="true"><PlusIcon size={14} /></span>
          Add another {provider.label} account
        </button>
      )}
      <ActionError className="provider-update-result account-list-error" message={error} onDismiss={() => setError("")} />
    </div>
  );
}
