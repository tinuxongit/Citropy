import { useEffect, useState } from "react";
import type { Bot, BotProfile } from "../../../../shared/bots.ts";
import type { Connection } from "../../../../shared/features.ts";
import { api } from "../../lib/api.ts";
import { SiteIcon } from "../SiteIcon.tsx";

export function BotConnections({ bot, onChange }: { bot: Pick<Bot, "name" | "connections">; onChange: (profile: Partial<BotProfile>) => void }) {
  const [connections, setConnections] = useState<Connection[]>();
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
  // Picks of removed connections still count, so the bot never gains a sign-in when a connection goes away.
  const picked = connections?.filter((connection) => bot.connections.includes(connection.id)).map((connection) => connection.id) ?? [];
  const toggle = (id: string, on: boolean) =>
    onChange({ connections: on ? [...picked, id] : picked.filter((entry) => entry !== id) });
  const summary = !bot.connections.length
    ? `${bot.name} is signed in to every connection. Pick some to sign it in to only those.`
    : picked.length
      ? `${bot.name} is signed in only to the connections you picked. It visits other sites signed out.`
      : `${bot.name} isn't signed in anywhere because the connections you picked were removed. Pick one, or pick and clear one to sign it in everywhere.`;
  return (
    <section className="bot-connections" aria-label="Connections">
      <h3 className="bot-section-title">Connections</h3>
      {error ? (
        <p className="bot-memory-empty">{error}</p>
      ) : !connections ? null : connections.length ? (
        <>
          <p className="bot-memory-empty">{summary}</p>
          <div className="bot-connection-list">
            {connections.map((connection) => (
              <label key={connection.id} className="bot-notify">
                <SiteIcon url={connection.url} />
                <span>
                  <strong className="truncate">{connection.name}</strong>
                  <small className="truncate">{connection.site}</small>
                </span>
                <input type="checkbox" checked={picked.includes(connection.id)} onChange={(event) => toggle(connection.id, event.target.checked)} />
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className="bot-memory-empty">No connections yet. Add sites in Settings &gt; Connections.</p>
      )}
    </section>
  );
}
