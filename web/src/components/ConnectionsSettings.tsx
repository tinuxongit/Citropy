import { useEffect, useState } from "react";
import { SiteIcon } from "./SiteIcon.tsx";
import { PlusIcon } from "./icons/marks.tsx";
import { TrashIcon } from "./icons/actions.tsx";
import { api } from "../lib/api.ts";
import { confirmAction, useApp } from "../lib/store.ts";
import type { Connection } from "../../../shared/features.ts";
import { connectionMention, siteOf } from "../../../shared/connection-sites.mjs";
import suggestions from "../../../shared/connection-suggestions.json";
import { ActionError } from "./ActionError.tsx";

export function ConnectionsSettings() {
  const projectId = useApp((state) => state.activeProjectId);
  const [connections, setConnections] = useState<Connection[]>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
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
      setConnections(await api<Connection[]>(path, { method, body: JSON.stringify(input) }));
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const suggested = suggestions.filter((suggestion) => !connections?.some((connection) => connection.site === siteOf(suggestion.url)));
  const signIn = async (id: string) => {
    if (await perform(`connections/sign-in?projectId=${projectId}`, "POST", { id })) useApp.setState({ activeView: "chat" });
  };
  const signOut = async (connection: Connection) => {
    if (await confirmAction({
      title: `Sign out of ${connection.name}?`,
      description: "Citropy's browser forgets this site's sign-in. Agents can't use your account there until you sign in again.",
      label: "Sign out",
      danger: true,
    })) await perform("connections/status", "POST", { id: connection.id, signedIn: false });
  };
  const remove = async (connection: Connection) => {
    if (await confirmAction({
      title: `Remove ${connection.name}?`,
      description: "This also signs you out of it in Citropy's browser.",
      label: "Remove",
      danger: true,
    })) await perform("connections", "DELETE", { id: connection.id });
  };
  return (
    <div className="feature-stack">
      <p className="feature-note">
        Sign in to a website once in Citropy's browser. Agents can then open it with your account, and they ask you before buying, sending, posting, or deleting anything there. Each site keeps its own sign-in.
      </p>
      {connections && connections.length > 0 && (
        <section className="settings-group" aria-label="Connected websites">
          {connections.map((connection) => (
            <div className="setting-row connection-row" key={connection.id}>
              <span className="connection-site">
                <span className="connection-icon"><SiteIcon url={connection.url} /></span>
                <span>
                  <strong>{connection.name}</strong>
                  <small>{connection.site} · @{connectionMention(connection)}</small>
                </span>
              </span>
              <span className="row-actions">
                {connection.signedIn ? (
                  <button className="btn" data-variant="ghost" disabled={busy} onClick={() => void signOut(connection)}>Sign out</button>
                ) : (
                  <button className="btn" data-variant="primary" disabled={busy || !projectId} title={projectId ? undefined : "Open a project first"} onClick={() => void signIn(connection.id)}>Sign in</button>
                )}
                <button className="icon-btn" disabled={busy} aria-label={`Remove ${connection.name}`} title="Remove" onClick={() => void remove(connection)}>
                  <TrashIcon size={15} />
                </button>
              </span>
            </div>
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
    </div>
  );
}
