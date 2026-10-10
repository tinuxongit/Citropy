import { signInTerminalId, type ProviderInfo } from "../../../../shared/protocol.ts";
import type { ProviderMaintenance, ProviderSignIn } from "../../../../shared/provider-settings.ts";
import { DownloadIcon } from "../icons/arrows.tsx";
import { CheckIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { TerminalPane } from "../TerminalPane.tsx";

export function ProviderSetupCard({ provider, maintenance, signIn, signingIn, busy, onInstall, onSignIn, onCancelSignIn }: {
  provider: ProviderInfo;
  maintenance?: ProviderMaintenance;
  signIn?: ProviderSignIn;
  signingIn: boolean;
  busy: boolean;
  onInstall: () => void;
  onSignIn: () => void;
  onCancelSignIn: () => void;
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
        {!installed ? (
          <button type="button" className="btn" disabled={busy || !maintenance?.available} title={maintenance?.reason} onClick={onInstall}>
            {installing ? <Loader size={14} /> : <DownloadIcon size={14} />}{installing ? "Installing…" : "Install"}
          </button>
        ) : signIn?.signedIn ? (
          <span className="provider-up-to-date" role="status"><CheckIcon size={14} />Signed in</span>
        ) : signingIn ? (
          <button type="button" className="btn" onClick={onCancelSignIn}>Cancel</button>
        ) : (
          <button type="button" className="btn" data-variant="primary" disabled={!signIn} onClick={onSignIn}>Sign in</button>
        )}
      </div>
      {!installed && maintenance?.reason && <p className="provider-maintenance-note">{maintenance.reason}</p>}
      {maintenance?.message && (installing || maintenance.status === "error") && (
        <p className="provider-update-result" data-status={maintenance.status} role={maintenance.status === "error" ? "alert" : "status"}>
          {maintenance.message}
        </p>
      )}
      {signIn?.error && <p className="provider-update-result" data-status="error" role="alert">{signIn.error}</p>}
      {signingIn && (
        <div className="setup-sign-in">
          <p className="provider-maintenance-note">Follow the steps below. A browser window may open to finish signing in.</p>
          <div className="setup-sign-in-terminal">
            <TerminalPane termId={signInTerminalId(provider.id)} target={{ signIn: provider.id }} active />
          </div>
        </div>
      )}
    </section>
  );
}
