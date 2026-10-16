import { useState } from "react";
import { SiteIcon } from "../icons/SiteIcon.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { TrashIcon } from "../icons/actions.tsx";
import type { Connection, ConnectionAccount } from "../../../../shared/features.ts";

interface AccountHandlers {
  disabled: boolean;
  signInDisabled: boolean;
  onSignIn: (account: ConnectionAccount) => void;
  onSignOut: (account: ConnectionAccount) => void;
  onRemove: (account: ConnectionAccount) => void;
}

function AccountActions({ account, disabled, signInDisabled, onSignIn, onSignOut, onRemove }: AccountHandlers & { account: ConnectionAccount }) {
  return (
    <>
      {account.signedIn ? (
        <button className="btn" data-variant="ghost" disabled={disabled} onClick={() => onSignOut(account)}>Sign out</button>
      ) : (
        <button className="btn" data-variant="primary" disabled={disabled || signInDisabled} onClick={() => onSignIn(account)}>Sign in</button>
      )}
      <button className="icon-btn" disabled={disabled} aria-label={`Remove ${account.name}`} title="Remove" onClick={() => onRemove(account)}>
        <TrashIcon size={15} />
      </button>
    </>
  );
}

export function ConnectionRow({ connection, onAddAccount, ...handlers }: AccountHandlers & { connection: Connection; onAddAccount: (label: string) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [single] = connection.accounts.length === 1 ? connection.accounts : [];
  const closeForm = () => {
    setAdding(false);
    setLabel("");
  };
  return (
    <>
      <div className="setting-row connection-row">
        <span className="connection-site">
          <span className="connection-icon"><SiteIcon url={connection.url} /></span>
          <span>
            <strong>{connection.name}</strong>
            <small>{single ? `${connection.description} · @${single.mention}` : connection.description}</small>
          </span>
        </span>
        <span className="row-actions">
          <button className="btn" data-variant="ghost" disabled={handlers.disabled || adding} onClick={() => setAdding(true)}>
            <PlusIcon size={15} />
            Add account
          </button>
          {single && <AccountActions account={single} {...handlers} />}
        </span>
      </div>
      {!single && connection.accounts.map((account) => (
        <div className="setting-row connection-row connection-account" key={account.id}>
          <span>
            <strong>{account.label || "Default"}</strong>
            <small>@{account.mention}</small>
          </span>
          <span className="row-actions">
            <AccountActions account={account} {...handlers} />
          </span>
        </div>
      ))}
      {adding && (
        <form
          className="setting-row connection-account feature-inline"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onAddAccount(label)) closeForm();
          }}
        >
          <input aria-label={`Name for the new ${connection.name} account`} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Account name, like Work" maxLength={60} autoFocus />
          <button className="btn" type="button" onClick={closeForm}>Cancel</button>
          <button className="btn" data-variant="primary" disabled={handlers.disabled || !label.trim()}>Add and sign in</button>
        </form>
      )}
    </>
  );
}
