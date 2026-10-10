import type { ProviderInfo } from "../../../../shared/protocol.ts";
import type { ProviderMaintenance } from "../../../../shared/provider-settings.ts";
import { DownloadIcon } from "../icons/arrows.tsx";
import { Loader } from "../Loader.tsx";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { AccountRow } from "../providers/AccountRow.tsx";
import { signInFor, type useTerminalSignIns } from "../providers/use-provider-sign-ins.ts";

export function ProviderSetupCard({ provider, maintenance, signIns, busy, onInstall }: {
  provider: ProviderInfo;
  maintenance?: ProviderMaintenance;
  signIns: ReturnType<typeof useTerminalSignIns>;
  busy: boolean;
  onInstall: () => void;
}) {
  const installing = maintenance?.status === "updating";
  const installed = provider.available && !installing;
  return (
    <section className="settings-group setup-provider" aria-label={provider.label}>
      <div className="setting-row">
        <span className="setup-provider-identity">
          <span className="provider-setting-icon"><ProviderIcon provider={provider.id} /></span>
          <span>
            <strong>{provider.label}</strong>
            <small>{installed ? provider.version ?? "Installed" : "Not installed"}</small>
          </span>
        </span>
        {!installed && (
          <button type="button" className="btn" disabled={busy || !maintenance?.available} title={maintenance?.reason} onClick={onInstall}>
            {installing ? <Loader size={14} /> : <DownloadIcon size={14} />}{installing ? "Installing…" : "Install"}
          </button>
        )}
      </div>
      {!installed && maintenance?.reason && <p className="provider-maintenance-note">{maintenance.reason}</p>}
      {maintenance?.message && (installing || maintenance.status === "error") && (
        <p className="provider-update-result" data-status={maintenance.status} role={maintenance.status === "error" ? "alert" : "status"}>
          {maintenance.message}
        </p>
      )}
      {installed && (
        <AccountRow provider={provider} account={{ name: "Your account", available: true, modelCount: provider.models.length }}
          status={signInFor(signIns.signIns, provider.id)}
          terminalOpen={signIns.isTerminalOpen(provider.id)}
          disabled={busy}
          onOpenTerminal={() => signIns.openTerminal({ provider: provider.id })}
          onCloseTerminal={signIns.closeTerminal}
          onChange={signIns.reload} />
      )}
    </section>
  );
}
