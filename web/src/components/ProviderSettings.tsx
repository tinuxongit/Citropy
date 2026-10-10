import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import type { ProviderInfo, ProviderInstance } from "../../../shared/protocol.ts";
import { api, reportError } from "../lib/api.ts";
import { selectEnvironment, useEnvironments } from "../lib/environment.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { ArrowUpToLineIcon } from "./icons/arrows.tsx";
import { RefreshIcon } from "./icons/rotation.tsx";
import { Loader } from "./Loader.tsx";
import { ProviderInstructions } from "./ProviderInstructions.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { confirmStop } from "./providers/confirm-stop.ts";
import { ProviderDialog } from "./providers/ProviderDialog.tsx";
import { accountSummary, versionSummary } from "./providers/provider-summary.ts";
import { useProviderMaintenance } from "./providers/use-provider-maintenance.ts";
import { useTerminalSignIns } from "./providers/use-provider-sign-ins.ts";
import { RuntimeDownloads } from "./RuntimeDownloads.tsx";
import { Select } from "./Select.tsx";
import { SettingsCard } from "./SettingsCard.tsx";

function updateSummary(available: number, checked: boolean): string {
  if (available) return available === 1 ? "1 update available" : `${available} updates available`;
  return checked ? "Everything is up to date" : "";
}

export function ProviderSettings() {
  const environments = useEnvironments();
  const [switching, setSwitching] = useState(false);
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const threads = useApp((state) => state.threads);
  const resumeAfterLimits = useApp((state) => state.resumeAfterLimits);
  const { maintenance, error: maintenanceError, checking, updating, refresh: refreshMaintenance, update, updateAll } = useProviderMaintenance();
  const signIns = useTerminalSignIns();
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ProviderInfo>();
  const [openId, setOpenId] = useState("");
  const [instances, setInstances] = useState<ProviderInstance[]>([]);
  const disabled = !connected || switching;

  useEffect(() => {
    if (!connected) { setInstances([]); return; }
    const controller = new AbortController();
    api<ProviderInstance[]>("providers/instances", { signal: controller.signal }).then(setInstances).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, [connected, environments.activeId]);

  const activeCount = (provider: string) => Object.values(threads).filter(thread => thread.provider === provider && (thread.running || thread.status === "awaiting")).length;
  const eligible = maintenance.some(entry => entry.available && !entry.install && entry.binaryPath && entry.updateStatus !== "current" && !activeCount(entry.provider));
  const available = maintenance.filter(entry => entry.updateStatus === "available").length;
  const stateOf = (provider: ProviderInfo) => maintenance.find(entry => entry.provider === provider.id);
  const opened = providers.find(provider => provider.id === openId);
  const checked = maintenance.length > 0 && maintenance.every(entry => entry.install || entry.updateStatus === "current");

  return (
    <>
      {environments.connections.length > 0 && (
        <div className="settings-group provider-environment">
          <label className="setting-row">
            <span>
              <strong>Environment</strong>
              <small>Manage the providers installed on this computer or on a connected one.</small>
            </span>
            <Select aria-label="Provider environment" value={environments.activeId}
              disabled={switching || !window.citropyDesktop?.connectEnvironment}
              onChange={async id => {
                if (id === environments.activeId) return;
                setSwitching(true);
                setEditor(undefined);
                setOpenId("");
                setInstances([]);
                try { await selectEnvironment(id); } catch (cause) { reportError(cause); }
                finally { setSwitching(false); }
              }}
              options={[
                { value: "local", label: "Local" },
                ...environments.connections.map(connection => ({ value: connection.id, label: connection.name })),
              ]} />
          </label>
          {switching && <p className="provider-maintenance-note" role="status">Connecting…</p>}
        </div>
      )}
      <div className="providers-toolbar">
        <p role="status">{updateSummary(available, checked)}</p>
        {eligible && (
          <button className="btn" disabled={disabled || updating || checking}
            title="Update installed providers. Providers with active conversations are skipped."
            onClick={() => void updateAll()}><ArrowUpToLineIcon size={14} />Update all</button>
        )}
        <button className="btn" disabled={disabled || updating || checking} onClick={refreshMaintenance}>
          {checking ? <Loader size={14} /> : <RefreshIcon size={14} />}Check for updates
        </button>
      </div>
      <div className="settings-card-grid provider-grid">
        {providers.map(provider => {
          const state = stateOf(provider);
          return (
            <SettingsCard key={provider.id}
              title={provider.label}
              subtitle={versionSummary(provider, state)}
              description={accountSummary(provider, signIns.signIns)}
              icon={<ProviderIcon provider={provider.id} />}
              toggle={{
                checked: provider.enabled,
                label: `Use ${provider.label}`,
                busy: disabled || state?.status === "updating",
                onChange: async () => {
                  const enabled = !provider.enabled;
                  if (!enabled && !await confirmStop(activeCount(provider.id), `Turn off ${provider.label}?`, "Turn off")) return;
                  send({ t: "providers.configure", provider: provider.id, enabled });
                },
              }}
              onOpen={() => setOpenId(provider.id)} />
          );
        })}
      </div>
      <RuntimeDownloads onInstalled={refreshMaintenance} />
      {(error || maintenanceError || signIns.error) && (
        <p className="dialog-error" role="alert">
          {error || maintenanceError || signIns.error}
          <button className="btn" onClick={() => { refreshMaintenance(); signIns.reload(); }}>Retry</button>
        </p>
      )}
      <h2 className="settings-group-heading">Usage limits</h2>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Resume after usage limits</strong>
            <small>When a chat stops because a usage limit is reached, continue it automatically once the limit resets. You can also turn this on for a single chat.</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch" checked={resumeAfterLimits} disabled={!connected}
            onChange={event => send({ t: "limits.configure", resumeAfterLimits: event.target.checked })} />
        </label>
      </div>
      <p className="settings-note">Updates use each provider's own installer. Turning a provider off stops its active chats and hides it from new ones. Saved conversations stay available.</p>
      <p className="settings-connection" role="status">{connected ? "Connected to Citropy" : "Disconnected from Citropy"}</p>
      <AnimatePresence>{opened && (
        <ProviderDialog provider={opened}
          state={stateOf(opened)}
          active={activeCount(opened.id)}
          instances={instances.filter(instance => instance.provider === opened.id)}
          signIns={signIns}
          disabled={disabled}
          updating={updating}
          onUpdate={() => void update(opened)}
          onEditInstructions={() => setEditor(opened)}
          onSaved={saved => setInstances(previous => [...previous.filter(entry => entry.id !== saved.id), saved])}
          onRemoved={id => setInstances(previous => previous.filter(entry => entry.id !== id))}
          onClose={() => setOpenId("")} />
      )}</AnimatePresence>
      <AnimatePresence>{editor && <ProviderInstructions provider={editor} onClose={() => setEditor(undefined)} />}</AnimatePresence>
    </>
  );
}
