import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { confirmAction, useApp } from "../lib/store.ts";
import type { McpOverview, McpServerDraft } from "../../../shared/features.ts";
import { ActionError } from "./ActionError.tsx";
import { McpPasteBox } from "./mcp/McpPasteBox.tsx";
import { McpServerIcon } from "./mcp/McpServerIcon.tsx";
import { McpServerRow } from "./mcp/McpServerRow.tsx";

const list = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function McpSettings() {
  const providers = useApp((state) => state.providers);
  const [overview, setOverview] = useState<McpOverview>();
  const [open, setOpen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<McpOverview>("mcp", { signal: controller.signal })
      .then(setOverview)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  const waiting = overview?.servers.some(
    (server) => server.enabled && (server.status === "starting" || server.status === "signin"),
  );
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(
      () =>
        void api<McpOverview>("mcp")
          .then(setOverview)
          .catch((error) => setError(error.message)),
      2000,
    );
    return () => clearInterval(timer);
  }, [waiting]);
  const perform = async (path: string, method: string, input: object) => {
    setBusy(true);
    setError("");
    try {
      setOverview(await api<McpOverview>(path, { method, body: JSON.stringify(input) }));
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = (servers: McpServerDraft[]) => perform("mcp", "POST", { servers });
  const found = overview?.found ?? [];
  const foundIn = list(
    [...new Set(found.flatMap((server) => server.providers))].map(
      (id) => providers.find((provider) => provider.id === id)?.label ?? id,
    ),
  );
  return (
    <div className="feature-stack">
      <p className="feature-note">
        Add a server once and every provider gets its tools in every project. Open a server to
        choose which tools agents may use without asking. Open conversations switch to new tools
        once their prompt cache cools, so they don't reread their history.
      </p>
      <McpPasteBox disabled={busy || !overview} onAdd={add} />
      {found.length > 0 && (
        <section className="settings-group mcp-found" aria-label="Servers found on this computer">
          <div className="setting-row">
            <span className="mcp-found-icons" aria-hidden="true">
              {found.slice(0, 4).map((server) => (
                <McpServerIcon key={server.name} server={server} />
              ))}
            </span>
            <span>
              <strong>
                {found.length === 1 ? "1 server" : `${found.length} servers`} in {foundIn}
              </strong>
              <small>{list(found.map((server) => server.name))}</small>
            </span>
            <span className="row-actions">
              <button
                className="btn"
                disabled={busy}
                onClick={() => void perform("mcp", "POST", { found: true })}
              >
                Use everywhere
              </button>
            </span>
          </div>
        </section>
      )}
      {overview && overview.servers.length > 0 && (
        <>
          <h2 className="settings-group-heading">Your servers</h2>
          <section className="settings-group" aria-label="Your servers">
            {overview.servers.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                open={open === server.id}
                disabled={busy}
                onToggleOpen={() => setOpen(open === server.id ? undefined : server.id)}
                onEnable={(enabled) =>
                  void perform("mcp/server", "PATCH", { id: server.id, enabled })
                }
                onAccess={(tool, access) =>
                  void perform("mcp/tool", "PATCH", { id: server.id, tool, access })
                }
                onSignIn={() =>
                  server.signInUrl
                    ? window.open(server.signInUrl, "_blank", "noopener,noreferrer")
                    : void perform("mcp/restart", "POST", { id: server.id })
                }
                onRestart={() => void perform("mcp/restart", "POST", { id: server.id })}
                onRemove={async () => {
                  if (
                    await confirmAction({
                      title: `Remove ${server.name}?`,
                      description: "Agents lose its tools from their next message.",
                      label: "Remove",
                      danger: true,
                    })
                  )
                    await perform("mcp", "DELETE", { id: server.id });
                }}
              />
            ))}
          </section>
        </>
      )}
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
    </div>
  );
}
