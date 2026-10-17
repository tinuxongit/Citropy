import { ChevronDownIcon } from "../icons/chevrons.tsx";
import { CheckIcon } from "../icons/marks.tsx";
import { BanIcon, ShieldHelpIcon } from "../icons/status.tsx";
import { RefreshIcon } from "../icons/rotation.tsx";
import { TrashIcon } from "../icons/actions.tsx";
import { Loader } from "../Loader.tsx";
import type { McpServer, McpTool, McpToolAccess } from "../../../../shared/features.ts";
import { McpServerIcon } from "./McpServerIcon.tsx";
import { serverAddress } from "./McpPasteBox.tsx";

const ACCESS: Record<
  McpToolAccess,
  { label: string; next: McpToolAccess; Icon: typeof CheckIcon }
> = {
  ask: { label: "Asks first", next: "allow", Icon: ShieldHelpIcon },
  allow: { label: "Always allowed", next: "off", Icon: CheckIcon },
  off: { label: "Off", next: "ask", Icon: BanIcon },
};

function Status({
  server,
  onSignIn,
  onOpen,
}: {
  server: McpServer;
  onSignIn: () => void;
  onOpen: () => void;
}) {
  if (!server.enabled) return <span className="mcp-status">Off</span>;
  if (server.status === "starting")
    return (
      <span className="mcp-status">
        <Loader size={13} />
        Starting
      </span>
    );
  if (server.status === "signin")
    return (
      <button className="btn" data-variant="primary" onClick={onSignIn}>
        Sign in
      </button>
    );
  if (server.status === "failed")
    return (
      <button className="btn mcp-status" data-variant="ghost" data-status="failed" onClick={onOpen}>
        <span className="mcp-dot" />
        Didn't start
      </button>
    );
  const off = server.tools.filter((tool) => tool.access === "off").length;
  return (
    <span className="mcp-status" data-status="connected">
      <span className="mcp-dot" />
      {server.tools.length - off} {server.tools.length - off === 1 ? "tool" : "tools"}
    </span>
  );
}

function ToolChip({
  tool,
  disabled,
  onChange,
}: {
  tool: McpTool;
  disabled: boolean;
  onChange: (access: McpToolAccess) => void;
}) {
  const { label, next, Icon } = ACCESS[tool.access];
  return (
    <button
      type="button"
      className="mcp-tool"
      data-access={tool.access}
      disabled={disabled}
      aria-label={`${tool.name}: ${label}`}
      title={`${tool.description}\n\n${label}. Click for ${ACCESS[next].label.toLowerCase()}.`}
      onClick={() => onChange(next)}
    >
      <Icon size={12} />
      {tool.name.replaceAll("_", " ")}
    </button>
  );
}

export function McpServerRow({
  server,
  open,
  disabled,
  onToggleOpen,
  onEnable,
  onAccess,
  onSignIn,
  onRestart,
  onRemove,
}: {
  server: McpServer;
  open: boolean;
  disabled: boolean;
  onToggleOpen: () => void;
  onEnable: (enabled: boolean) => void;
  onAccess: (tool: string, access: McpToolAccess) => void;
  onSignIn: () => void;
  onRestart: () => void;
  onRemove: () => void;
}) {
  const id = `mcp-${server.id}`;
  return (
    <div className="mcp-server" data-open={open || undefined} data-enabled={server.enabled}>
      <div className="setting-row mcp-server-row">
        <button
          type="button"
          className="mcp-server-open"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggleOpen}
        >
          <McpServerIcon server={server} />
          <span>
            <strong>{server.name}</strong>
            <small>{serverAddress(server)}</small>
          </span>
          <ChevronDownIcon size={14} className="mcp-chevron" />
        </button>
        <span className="row-actions">
          <Status server={server} onSignIn={onSignIn} onOpen={() => !open && onToggleOpen()} />
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            aria-label={`Use ${server.name}`}
            checked={server.enabled}
            disabled={disabled}
            onChange={() => onEnable(!server.enabled)}
          />
        </span>
      </div>
      {open && (
        <div className="mcp-server-detail" id={id}>
          {server.status === "failed" && server.error && (
            <pre className="feature-error mcp-error">{server.error}</pre>
          )}
          {server.tools.length > 0 && (
            <>
              <p className="mcp-legend">
                Click a tool to choose how agents use it.
                {Object.entries(ACCESS).map(([access, { label, Icon }]) => (
                  <span key={access} data-access={access}>
                    <Icon size={12} />
                    {label}
                  </span>
                ))}
              </p>
              <div className="mcp-tools">
                {server.tools.map((tool) => (
                  <ToolChip
                    key={tool.name}
                    tool={tool}
                    disabled={disabled || !server.enabled}
                    onChange={(access) => onAccess(tool.name, access)}
                  />
                ))}
              </div>
            </>
          )}
          <div className="mcp-server-footer">
            <code>{server.url ?? [server.command, ...(server.args ?? [])].join(" ")}</code>
            <button className="btn" data-variant="ghost" disabled={disabled} onClick={onRestart}>
              <RefreshIcon size={14} />
              Restart
            </button>
            <button
              className="icon-btn"
              disabled={disabled}
              aria-label={`Remove ${server.name}`}
              title="Remove"
              onClick={onRemove}
            >
              <TrashIcon size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
