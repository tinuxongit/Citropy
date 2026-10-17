import { useState } from "react";
import { PlugIcon } from "../icons/hardware.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { readMcpPaste } from "../../../../shared/mcp-paste.ts";
import type { McpServerAddress, McpServerDraft } from "../../../../shared/features.ts";
import { McpServerIcon } from "./McpServerIcon.tsx";

export const serverAddress = (server: McpServerAddress) =>
  server.url ? new URL(server.url).host : [server.command, ...(server.args ?? [])].join(" ");

// One box takes whatever a server's README offers: a link, a command, or a JSON config.
export function McpPasteBox({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (servers: McpServerDraft[]) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const read = readMcpPaste(text);
  const servers = read && "servers" in read ? read.servers : [];
  return (
    <form
      className="mcp-paste"
      data-dragging={dragging || undefined}
      data-ready={servers.length > 0 || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (servers.length && (await onAdd(servers))) setText("");
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        event.preventDefault();
        setDragging(false);
        void file.text().then(setText);
      }}
    >
      <label className="mcp-paste-field">
        <PlugIcon size={18} />
        <textarea
          aria-label="Server to add"
          rows={1}
          spellCheck={false}
          placeholder="Paste a server link, an install command, or the JSON from its README"
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {read && "error" in read && <p className="mcp-paste-hint">{read.error}</p>}
      {servers.length > 0 && (
        <div className="mcp-paste-found">
          <ul>
            {servers.map((server) => (
              <li key={server.name}>
                <McpServerIcon server={server} />
                <span>
                  <strong>{server.name}</strong>
                  <small>{serverAddress(server)}</small>
                </span>
                <span className="mcp-kind">{server.url ? "Online" : "On this computer"}</span>
              </li>
            ))}
          </ul>
          <button className="btn" data-variant="primary" disabled={disabled}>
            <PlusIcon size={15} />
            {servers.length === 1 ? "Add server" : `Add ${servers.length} servers`}
          </button>
        </div>
      )}
    </form>
  );
}
