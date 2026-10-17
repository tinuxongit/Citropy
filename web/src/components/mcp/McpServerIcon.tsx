import { SiteIcon } from "../icons/SiteIcon.tsx";
import type { McpServerAddress } from "../../../../shared/features.ts";

export function McpServerIcon({ server }: { server: McpServerAddress }) {
  return (
    <span className="connection-icon mcp-server-icon" aria-hidden="true">
      {server.url ? <SiteIcon url={server.url} /> : server.name[0]?.toUpperCase()}
    </span>
  );
}
