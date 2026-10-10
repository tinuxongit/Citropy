import type { GitRuntimeStatus, NodeRuntimeStatus } from "../../../shared/runtime-downloads.ts";
import { RuntimeRow, type Runtime } from "./runtimes/RuntimeRow.tsx";

const NODE: Runtime<NodeRuntimeStatus> = {
  id: "node",
  label: "Node.js",
  installLabel: "Install Node.js",
  purpose: () => "Node.js and npm for provider installation and development.",
  installed: (status) => `Node ${status.version ?? ""} · npm ${status.npmVersion ?? ""}`,
  unsupported: () => "Automatic installation supports Linux, macOS, and Windows on x64 or ARM64.",
  pendingSetup: { label: "Set up terminals", needed: (status) => status.shellReady === false },
};

const GIT: Runtime<GitRuntimeStatus> = {
  id: "git",
  label: "Git",
  installLabel: "Install Git",
  purpose: (status) => status?.supported ? `Tracks changes in your projects. ${status.method}` : "Tracks changes in your projects.",
  installed: (status) => `Git ${status.version ?? ""}`,
  unsupported: (status) => status.method,
};

export function RuntimeDownloads({ onInstalled }: { onInstalled?: () => void }) {
  return <>
    <h2 className="settings-group-heading settings-group-spaced">Runtime downloads</h2>
    <div className="settings-group" aria-label="Runtime downloads">
      <RuntimeRow runtime={NODE} onInstalled={onInstalled} />
      <RuntimeRow runtime={GIT} onInstalled={onInstalled} />
    </div>
  </>;
}
