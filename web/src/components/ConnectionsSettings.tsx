import { useEffect, useState } from "react";
import { SiteIcon } from "./icons/SiteIcon.tsx";
import { PlusIcon } from "./icons/marks.tsx";
import { api } from "../lib/api.ts";
import { confirmAction } from "../lib/store.ts";
import type { Connection, ConnectionAccount } from "../../../shared/features.ts";
import { siteOf } from "../../../shared/connection-sites.mjs";
import suggestions from "../../../shared/connection-suggestions.json";
import { ActionError } from "./ActionError.tsx";
import { SignInDialog } from "./SignInDialog.tsx";
import { ConnectionRow } from "./connections/ConnectionRow.tsx";
import { AnimatePresence } from "motion/react";

export function ConnectionsSettings() {
  const [connections, setConnections] = useState<Connection[]>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState<{ connection: Connection; account: ConnectionAccount }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Connection[]>("connections", { signal: controller.signal })
      .then(setConnections)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  const perform = async (path: string, method: string, input: object) => {
    setBusy(true);
    setError("");
    try {
      const list = await api<Connection[]>(path, { method, body: JSON.stringify(input) });
      setConnections(list);
      return list;
    } catch (error) {
      setError((error as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const suggested = suggestions.filter((suggestion) => !connections?.some((connection) => connection.site === siteOf(suggestion.url)));
  const signIn = async (connection: Connection, account: ConnectionAccount) => {
    setSigningIn({ connection, account });
    setError("");
    try {
      if (!window.citropyDesktop) throw new Error("Open Citropy desktop to sign in.");
      setConnections(await window.citropyDesktop.signIn(account.id));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSigningIn(undefined);
    }
  };
  const addAccount = async (connection: Connection, label: string) => {
    const list = await perform("connections/accounts", "POST", { id: connection.id, label });
    if (list) void signIn(connection, list.find((entry) => entry.id === connection.id)!.accounts.at(-1)!);
    return Boolean(list);
  };
  const signOut = async (account: ConnectionAccount) => {
    if (await confirmAction({
      title: `Sign out of ${account.name}?`,
      description: "This also closes its open browser tabs. Agents can't use your account there until you sign in again.",
      label: "Sign out",
      danger: true,
    })) await perform("connections/status", "POST", { id: account.id, signedIn: false });
  };
  const remove = async (account: ConnectionAccount) => {
    if (await confirmAction({
      title: `Remove ${account.name}?`,
      description: "This also signs you out of it in Citropy's browser and closes its open tabs.",
      label: "Remove",
      danger: true,
    })) await perform("connections", "DELETE", { id: account.id });
  };
  return (
    <div className="feature-stack">
      <p className="feature-note">
        Sign in to a website once in Citropy. Agents can then open it with your account, and they ask you before buying, sending, posting, or deleting anything there. Each account keeps its own sign-in, and Add account signs in to another account on the same site.
      </p>
      {connections && connections.length > 0 && (
        <section className="settings-group" aria-label="Connected websites">
          {connections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              disabled={busy}
              signInDisabled={Boolean(signingIn)}
              onSignIn={(account) => void signIn(connection, account)}
              onSignOut={(account) => void signOut(account)}
              onRemove={(account) => void remove(account)}
              onAddAccount={(label) => addAccount(connection, label)}
            />
          ))}
        </section>
      )}
      {connections && suggested.length > 0 && (
        <>
          <h2 className="settings-group-heading">Suggested</h2>
          <section className="settings-group" aria-label="Suggested websites">
            {suggested.map((suggestion) => (
              <div className="setting-row connection-row" key={suggestion.url}>
                <span className="connection-site">
                  <span className="connection-icon"><SiteIcon url={suggestion.url} /></span>
                  <span>
                    <strong>{suggestion.name}</strong>
                    <small>{"description" in suggestion ? suggestion.description : siteOf(suggestion.url)}</small>
                  </span>
                </span>
                <span className="row-actions">
                  <button className="btn" data-variant="ghost" disabled={busy} aria-label={`Add ${suggestion.name}`} onClick={() => void perform("connections", "POST", { name: suggestion.name, url: suggestion.url })}>
                    <PlusIcon size={15} />
                    Add
                  </button>
                </span>
              </div>
            ))}
          </section>
        </>
      )}
      <h2 className="settings-group-heading">Add a website</h2>
      <section className="settings-group">
        <form
          className="feature-inline"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await perform("connections", "POST", { name, url })) {
              setName("");
              setUrl("");
            }
          }}
        >
          <input aria-label="Connection name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, like Gmail" maxLength={60} />
          <input aria-label="Website address" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="mail.google.com" />
          <button className="btn" disabled={busy || !name.trim() || !url.trim() || !connections}>
            <PlusIcon size={15} />
            Add
          </button>
        </form>
      </section>
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
      <AnimatePresence>{signingIn && <SignInDialog key={signingIn.account.id} connection={signingIn.connection} account={signingIn.account} />}</AnimatePresence>
    </div>
  );
}
