import { RuntimeDownloads } from "./RuntimeDownloads.tsx";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowUpToLineIcon } from "./icons/arrows.tsx";
import { CheckIcon, PlusIcon } from "./icons/marks.tsx";
import { FileTextIcon } from "./icons/files.tsx";
import { RefreshIcon } from "./icons/rotation.tsx";
import { TrashIcon } from "./icons/actions.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ProviderInstructions } from "./ProviderInstructions.tsx";
import { api, reportError } from "../lib/api.ts";
import { confirmAction, useApp } from "../lib/store.ts";
import { send } from "../lib/socket.ts";
import type { ProviderInfo } from "../../../shared/protocol.ts";
import { hasUsableAccount } from "../../../shared/provider-account.ts";
import { Select } from "./Select.tsx";
import { selectEnvironment, useEnvironments } from "../lib/environment.ts";
import { Loader } from "./Loader.tsx";
import { Modal } from "./Modal.tsx";
import type { ProviderInstance } from "../../../shared/protocol.ts";
import { ActionError } from "./ActionError.tsx";
import { useProviderMaintenance } from "./providers/use-provider-maintenance.ts";

function InstanceEditor({ provider, instance, onClose, onSaved }: { provider: ProviderInfo; instance?: ProviderInstance; onClose: () => void; onSaved: (instance: ProviderInstance) => void }) {
  const [name, setName] = useState(instance?.name ?? "");
  const [binary, setBinary] = useState(instance?.binary ?? "");
  const [environment, setEnvironment] = useState(JSON.stringify(instance?.environment ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const variables = JSON.parse(environment);
      if (!variables || typeof variables !== "object" || Array.isArray(variables)) throw new Error("Enter environment variables as a JSON object.");
      const saved = await api<ProviderInstance>("providers/instances", { method: "POST", body: JSON.stringify({ id: instance?.id, provider: provider.id, name, binary: binary || undefined, environment: variables }) });
      onSaved(saved);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title={instance ? "Edit account" : "Add account"} description={`Run ${provider.label} with a separate CLI configuration.`} busy={busy} onClose={onClose} onSubmit={() => void save()} initialFocus="#provider-instance-name" footer={<>
    <button className="btn" type="button" data-cancel onClick={onClose} disabled={busy}>Cancel</button>
    <button className="btn" data-variant="primary" disabled={busy || !name.trim()}>{busy && <Loader size={14} />}Save account</button>
  </>}>
    <label className="feature-field">Name<input id="provider-instance-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
    <label className="feature-field">CLI path (optional)<input value={binary} onChange={event => setBinary(event.target.value)} placeholder={provider.binary} /></label>
    <label className="feature-field">Environment variables (JSON)<textarea value={environment} rows={5} spellCheck={false} onChange={event => setEnvironment(event.target.value)} /></label>
    <ActionError className="dialog-error" message={error} onDismiss={() => setError("")} />
  </Modal>;
}

export function ProviderSettings() {
  const environments = useEnvironments();
  const [switching, setSwitching] = useState(false);
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const threads = useApp((state) => state.threads);
  const resumeAfterLimits = useApp((state) => state.resumeAfterLimits);
  const { maintenance, error: maintenanceError, checking, updating, refresh: refreshMaintenance, update, updateAll } = useProviderMaintenance();
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ProviderInfo>();
  const [instances, setInstances] = useState<ProviderInstance[]>([]);
  const [instanceEditor, setInstanceEditor] = useState<{ provider: ProviderInfo; instance?: ProviderInstance }>();

  useEffect(() => {
    if (!connected) { setInstances([]); return; }
    const controller = new AbortController();
    api<ProviderInstance[]>("providers/instances", { signal: controller.signal }).then(setInstances).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, [connected, environments.activeId]);

  const eligible = maintenance.some(entry =>
    entry.available && !entry.install && entry.binaryPath && entry.updateStatus !== "current" &&
    !Object.values(threads).some(thread => thread.provider === entry.provider && (thread.running || thread.status === "awaiting")));

  return (
    <>
      <div className="settings-group provider-environment">
        <label className="setting-row">
          <span>
            <strong>Environment</strong>
            <small>Switch the active environment to manage its providers.</small>
          </span>
          <Select aria-label="Provider environment" value={environments.activeId}
            disabled={switching || !window.citropyDesktop?.connectEnvironment}
            onChange={async id => {
              if (id === environments.activeId) return;
              setSwitching(true);
              setEditor(undefined);
              setInstanceEditor(undefined);
              setInstances([]);
              try { await selectEnvironment(id); } catch (error) { reportError(error); }
              finally { setSwitching(false); }
            }}
            options={[
              { value: "local", label: "Local" },
              ...environments.connections.map(connection => ({ value: connection.id, label: connection.name })),
            ]} />
        </label>
        {switching && <p className="provider-maintenance-note" role="status">Connecting…</p>}
        <label className="setting-row">
          <span>
            <strong>Resume after usage limits</strong>
            <small>When a chat stops because a usage limit is reached, continue it automatically once the limit resets. You can also turn this on for a single chat.</small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={resumeAfterLimits}
            disabled={!connected}
            onChange={(event) => send({ t: "limits.configure", resumeAfterLimits: event.target.checked })}
          />
        </label>
      </div>
      <div className="provider-maintenance-heading">
      <h2 className="settings-group-heading">Installed providers</h2>
        <button className="btn" disabled={!connected || switching || updating || checking || !eligible}
          title="Update installed providers in this environment. Providers with active conversations are skipped."
          onClick={() => void updateAll()}><ArrowUpToLineIcon size={14} />Update all</button>
        <button
          className="btn"
          disabled={!connected || switching || updating || checking}
          onClick={refreshMaintenance}
        >
          {checking ? <Loader size={14} /> : <RefreshIcon size={14} />}{" "}Check for updates{" "}</button>
      </div>
      <div className="provider-settings-group">
        {providers.map((provider) => {
          const state = maintenance.find(
            (entry) => entry.provider === provider.id,
          );
          const active = Object.values(threads).filter(
            (thread) =>
              thread.provider === provider.id &&
              (thread.running || thread.status === "awaiting"),
          ).length;
          const installing = state?.install ?? !provider.available;
          const isUpdating = state?.status === "updating";
          return (
            <section
              className="settings-group provider-card"
              key={provider.id}
              aria-label={provider.label}
            >
              <div className="provider-setting">
                <div className="provider-setting-identity">
                  <span className="provider-setting-icon">
                    <ProviderIcon provider={provider.id} />
                  </span>
                  <div>
                    <strong>{provider.label}</strong>
                    <small>
                      {state?.version ??
                        provider.version ??
                        (provider.enabled
                          ? "No version detected"
                          : "Not checked while disabled")}
                    </small>
                  </div>
                </div>
                <div className="provider-setting-status">
                  <span data-available={hasUsableAccount(provider)}>
                    {!provider.enabled
                      ? "Disabled"
                      : provider.available
                        ? "Enabled"
                        : provider.instances?.some(entry => entry.available) ? "Account available" : "Not installed"}
                  </span>
                  <small>
                    {provider.enabled
                      ? (provider.models.length === 1 ? `${provider.models.length} model` : `${provider.models.length} models`)
                      : "Not in new threads"}
                  </small>
                </div>
                <input
                  className="setting-switch"
                  type="checkbox"
                  role="switch"
                  aria-label={`Enable ${provider.label}`}
                  checked={provider.enabled}
                  disabled={!connected || switching || isUpdating}
                  onChange={async (event) => {
                    const enabled = event.target.checked;
                    if (
                      !enabled &&
                      active &&
                      !(await confirmAction({
                        title: `Disable ${provider.label}?`,
                        description: `This stops ${active} active ${active === 1 ? "conversation" : "conversations"}. Saved conversations will remain available.`,
                        label: "Disable provider",
                        danger: true,
                      }))
                    )
                      return;
                    send({
                      t: "providers.configure",
                      provider: provider.id,
                      enabled,
                    });
                  }}
                />
                {provider.enabled && provider.modelsError && (
                  <p className="provider-setting-error" role="status">
                    {provider.modelsError}
                  </p>
                )}
              </div>
              <div className="provider-maintenance">
                {provider.openCodeVersion && (
                  <div className="provider-update-row">
                    <div className="provider-installation">
                      <span>OpenCode version</span>
                      <small>
                        {provider.openCodeVersion.active
                          ? `Using OpenCode ${provider.openCodeVersion.active}`
                          : "Version not detected"}
                      </small>
                    </div>
                    <Select
                      aria-label="OpenCode version"
                      value={String(provider.openCodeVersion.setting)}
                      disabled={!connected || switching || isUpdating}
                      options={[
                        { value: "auto", label: "Detect automatically" },
                        { value: "1", label: "OpenCode 1" },
                        { value: "2", label: "OpenCode 2" },
                      ]}
                      onChange={async (value) => {
                        if (
                          active &&
                          !(await confirmAction({
                            title: "Switch OpenCode version?",
                            description: `This stops ${active} active ${active === 1 ? "conversation" : "conversations"}. Saved conversations will remain available.`,
                            label: "Switch version",
                            danger: true,
                          }))
                        )
                          return;
                        send({ t: "providers.opencodeVersion", setting: value === "auto" ? "auto" : value === "2" ? 2 : 1 });
                      }}
                    />
                  </div>
                )}
                <div className="provider-update-row">
                  <div className="provider-installation">
                    <span>{state?.method ?? "CLI installation"}</span>
                    <small title={state?.binaryPath}>
                      {state?.binaryPath ?? provider.binary}
                    </small>
                  </div>
                  <button type="button" className="btn"
                    disabled={!connected || switching} onClick={() => setEditor(provider)}>
                    <FileTextIcon size={14} />Global instructions
                  </button>
                  {!installing && state?.updateStatus === "current" && !isUpdating ? (
                    <span className="provider-up-to-date" role="status">
                      <CheckIcon size={14} />{" "}Up to date{" "}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      aria-label={installing ? `Install ${provider.label}` : `Update ${provider.label}`}
                      disabled={
                        !connected || switching ||
                        !state?.available ||
                        updating ||
                        active > 0
                      }
                      title={
                        active
                          ? "Finish or stop active conversations before updating."
                          : (state?.reason ??
                            (installing ? "Install this provider in the selected environment." : "Check for updates and install with the existing installer."))
                      }
                      onClick={() => void update(provider)}
                    >
                      {isUpdating ? (
                        <Loader size={14} />
                      ) : (
                        <ArrowUpToLineIcon size={14} />
                      )}
                      {isUpdating
                        ? (installing ? "Installing…" : "Updating…")
                        : installing
                          ? "Install"
                        : state?.updateStatus === "available"
                          ? `Update to ${state.latestVersion ?? ""}`
                          : "Check & update"}
                    </button>
                  )}
                </div>
                {active > 0 && (
                  <p className="provider-maintenance-note">{" "}Updates are available after this provider finishes its active conversations.{" "}</p>
                )}
                {state?.reason && (
                  <p className="provider-maintenance-note">{state.reason}</p>
                )}
                {state?.message && (
                  <p
                    className="provider-update-result"
                    data-status={state.status}
                    role={state.status === "error" ? "alert" : "status"}
                  >
                    {state.status === "success" && <CheckIcon size={14} />}
                    {state.message}
                  </p>
                )}
                {state?.output && (
                  <details className="provider-update-output">
                    <summary>Update details</summary>
                    <code>{state.command}</code>
                    <pre className="scroll">{state.output}</pre>
                  </details>
                )}
              </div>

              <div className="provider-instances">
                <div className="provider-instances-heading"><strong>Accounts</strong><button type="button" className="btn" disabled={!connected || switching} onClick={() => setInstanceEditor({ provider })}><PlusIcon size={14} />Add account</button></div>
                {provider.instances?.map(entry => <div className="provider-instance-row" key={entry.id}>
                  <span><strong>{entry.name}</strong><small>{entry.available ? (entry.models.length === 1 ? `${entry.models.length} model` : `${entry.models.length} models`) : "CLI unavailable"}</small></span>
                  <button type="button" className="btn" disabled={!connected || switching || !instances.some(value => value.id === entry.id)} onClick={() => setInstanceEditor({ provider, instance: instances.find(value => value.id === entry.id) })}>Edit</button>
                  <button type="button" className="btn" aria-label={`Remove ${entry.name}`} disabled={!connected || switching} onClick={() => void (async () => {
                    if (!await confirmAction({ title: `Remove ${entry.name}?`, description: "Conversations and writing settings using this account must be removed first.", label: "Remove", danger: true })) return;
                    try { await api("providers/instances", { method: "DELETE", body: JSON.stringify({ id: entry.id }) }); setInstances(previous => previous.filter(value => value.id !== entry.id)); }
                    catch (cause) { reportError(cause); }
                  })()}><TrashIcon size={14} /></button>
                </div>)}
              </div>

            </section>
          );
        })}
      </div>
      <RuntimeDownloads onInstalled={refreshMaintenance} />
      {(error || maintenanceError) && (
        <p className="dialog-error" role="alert">
          {error || maintenanceError}{" "}
          <button
            className="btn"
            onClick={refreshMaintenance}
          >{" "}Retry{" "}</button>
        </p>
      )}
      <p className="settings-note">{" "}Updates use the provider's existing installer. Disabling a provider stops its active work and removes it from new thread choices. Saved conversations stay available.{" "}</p>
      <p className="settings-connection" role="status">
        {connected ? "Connected to Citropy" : "Disconnected from Citropy"}
      </p>
      <AnimatePresence>{editor && (
        <ProviderInstructions
          provider={editor}
          onClose={() => setEditor(undefined)}
        />
      )}</AnimatePresence>
      <AnimatePresence>{instanceEditor && <InstanceEditor key={instanceEditor.instance?.id ?? `${instanceEditor.provider.id}-new`} provider={instanceEditor.provider} instance={instanceEditor.instance} onClose={() => setInstanceEditor(undefined)} onSaved={saved => { setInstances(previous => [...previous.filter(entry => entry.id !== saved.id), saved]); setInstanceEditor(undefined); }} />}</AnimatePresence>
    </>
  );
}
