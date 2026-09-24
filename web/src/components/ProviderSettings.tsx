import { RuntimeDownloads } from "./RuntimeDownloads.tsx";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpToLine,
  Check,
  FileText,
  RefreshCw,
} from "lucide-react";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ProviderInstructions } from "./ProviderInstructions.tsx";
import { api, reportError } from "../lib/api.ts";
import { confirmAction, useApp } from "../lib/store.ts";
import { send } from "../lib/socket.ts";
import type { ProviderInfo } from "../../../shared/protocol.ts";
import type { ProviderMaintenance } from "../../../shared/provider-settings.ts";
import { useI18n } from "../lib/i18n.ts";
import { selectEnvironment, useEnvironments } from "../lib/environment.ts";
import { PixelLoader } from "./PixelLoader.tsx";

export function ProviderSettings() {
  const t = useI18n();
  const environments = useEnvironments();
  const [switching, setSwitching] = useState(false);
  const [starting, setStarting] = useState(false);
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const threads = useApp((state) => state.threads);
  const [maintenance, setMaintenance] = useState<ProviderMaintenance[]>([]);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const refreshMaintenance = useCallback(() => setRefresh(value => value + 1), []);
  const [editor, setEditor] = useState<ProviderInfo>();
  const updating = starting || maintenance.some((entry) => entry.status === "updating");

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const load = async () => {
      setChecking(true);
      try {
        const value = await api<ProviderMaintenance[]>(
          `providers/maintenance${refresh > 0 && first ? "?refresh=1" : ""}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        first = false;
        setMaintenance(value);
        setError("");
        if (value.some((entry) => entry.status === "updating"))
          timer = setTimeout(() => void load(), 1000);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [connected, refresh, providers]);

  const update = async (provider: ProviderInfo) => {
    setStarting(true);
    setMaintenance((previous) =>
      previous.map((entry) =>
        entry.provider === provider.id
          ? { ...entry, status: "updating", message: provider.available ? "Starting update…" : "Starting installation…" }
          : entry,
      ),
    );
    try {
      const value = await api<ProviderMaintenance>("providers/update", {
        method: "POST",
        body: JSON.stringify({ provider: provider.id }),
      });
      setMaintenance((previous) =>
        previous.map((entry) =>
          entry.provider === provider.id ? value : entry,
        ),
      );
    } catch (error) {
      reportError(error);
    } finally {
      setStarting(false);
      setRefresh((value) => value + 1);
    }
  };

  const eligible = maintenance.some(entry =>
    entry.available && !entry.install && entry.binaryPath && entry.updateStatus !== "current" &&
    !Object.values(threads).some(thread => thread.provider === entry.provider && (thread.running || thread.status === "awaiting")));

  const updateAll = async () => {
    setStarting(true);
    try {
      const queued = await api<ProviderMaintenance[]>("providers/update-all", { method: "POST" });
      setMaintenance(previous => previous.map(entry => queued.find(state => state.provider === entry.provider) ?? entry));
    } catch (error) {
      reportError(error);
    } finally {
      setStarting(false);
      setRefresh(value => value + 1);
    }
  };

  return (
    <>
      <div className="settings-group provider-environment">
        <label className="setting-row">
          <span>
            <strong>{t("Environment")}</strong>
            <small>{t("Switch the active environment to manage its providers.")}</small>
          </span>
          <select aria-label={t("Provider environment")} value={environments.activeId}
            disabled={switching || !window.citropyDesktop?.connectEnvironment}
            onChange={async event => {
              const id = event.target.value;
              if (id === environments.activeId) return;
              setSwitching(true);
              setEditor(undefined);
              try { await selectEnvironment(id); } catch (error) { reportError(error); }
              finally { setSwitching(false); }
            }}>
            <option value="local">{t("Local")}</option>
            {environments.connections.map(connection =>
              <option key={connection.id} value={connection.id}>{connection.name}</option>)}
          </select>
        </label>
        {switching && <p className="provider-maintenance-note" role="status">{t("Connecting…")}</p>}
      </div>
      <div className="provider-maintenance-heading">
      <h2 className="settings-group-heading">{t("Installed providers")}</h2>
        <button className="btn" disabled={!connected || switching || updating || checking || !eligible}
          title={t("Update installed providers in this environment. Providers with active conversations are skipped.")}
          onClick={() => void updateAll()}><ArrowUpToLine size={14} />{t("Update all")}</button>
        <button
          className="btn"
          disabled={!connected || switching || updating || checking}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {checking ? <PixelLoader size={14} /> : <RefreshCw size={14} />}{" "}{t("Check for updates")}{" "}</button>
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
                          ? t("No version detected")
                          : t("Not checked while disabled"))}
                    </small>
                  </div>
                </div>
                <div className="provider-setting-status">
                  <span data-available={provider.available && provider.enabled}>
                    {!provider.enabled
                      ? t("Disabled")
                      : provider.available
                        ? t("Enabled")
                        : t("Not installed")}
                  </span>
                  <small>
                    {provider.enabled
                      ? t("{count} models", { count: provider.models.length })
                      : t("Not in new threads")}
                  </small>
                </div>
                <input
                  className="setting-switch"
                  type="checkbox"
                  role="switch"
                  aria-label={t("Enable {provider}", { provider: provider.label })}
                  checked={provider.enabled}
                  disabled={!connected || switching || isUpdating}
                  onChange={async (event) => {
                    const enabled = event.target.checked;
                    if (
                      !enabled &&
                      active &&
                      !(await confirmAction({
                        title: t("Disable {provider}?", { provider: provider.label }),
                        description: t("This stops {count} active {conversations}. Saved conversations will remain available.", { count: active, conversations: active === 1 ? t("conversation") : t("conversations") }),
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
                <div className="provider-update-row">
                  <div className="provider-installation">
                    <span>{t(state?.method ?? "CLI installation")}</span>
                    <small title={state?.binaryPath}>
                      {state?.binaryPath ?? provider.binary}
                    </small>
                  </div>
                  <button type="button" className="btn"
                    disabled={!connected || switching} onClick={() => setEditor(provider)}>
                    <FileText size={14} />{t("Global instructions")}
                  </button>
                  {!installing && state?.updateStatus === "current" && !isUpdating ? (
                    <span className="provider-up-to-date" role="status">
                      <Check size={14} />{" "}{t("Up to date")}{" "}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      aria-label={t(installing ? "Install {provider}" : "Update {provider}", { provider: provider.label })}
                      disabled={
                        !connected || switching ||
                        !state?.available ||
                        updating ||
                        active > 0
                      }
                      title={
                        active
                          ? t("Finish or stop active conversations before updating.")
                          : (state?.reason ??
                            t(installing ? "Install this provider in the selected environment." : "Check for updates and install with the existing installer."))
                      }
                      onClick={() => void update(provider)}
                    >
                      {isUpdating ? (
                        <PixelLoader size={14} />
                      ) : (
                        <ArrowUpToLine size={14} />
                      )}
                      {isUpdating
                        ? t(installing ? "Installing…" : "Updating…")
                        : installing
                          ? t("Install")
                        : state?.updateStatus === "available"
                          ? t("Update to {version}", { version: state.latestVersion ?? "" })
                          : t("Check & update")}
                    </button>
                  )}
                </div>
                {active > 0 && (
                  <p className="provider-maintenance-note">{" "}{t("Updates are available after this provider finishes its active conversations.")}{" "}</p>
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
                    {state.status === "success" && <Check size={14} />}
                    {state.message}
                  </p>
                )}
                {state?.output && (
                  <details className="provider-update-output">
                    <summary>{t("Update details")}</summary>
                    <code>{state.command}</code>
                    <pre className="scroll">{state.output}</pre>
                  </details>
                )}
              </div>

            </section>
          );
        })}
      </div>
      <RuntimeDownloads onInstalled={refreshMaintenance} />
      {error && (
        <p className="dialog-error" role="alert">
          {error}{" "}
          <button
            className="btn"
            onClick={() => setRefresh((value) => value + 1)}
          >{" "}{t("Retry")}{" "}</button>
        </p>
      )}
      <p className="settings-note">{" "}{t("Updates use the provider’s existing installer. Disabling a provider stops its active work and removes it from new thread choices. Saved conversations stay available.")}{" "}</p>
      <p className="settings-connection" role="status">
        {connected ? t("Connected to Citropy") : t("Disconnected from Citropy")}
      </p>
      <AnimatePresence>{editor && (
        <ProviderInstructions
          provider={editor}
          onClose={() => setEditor(undefined)}
        />
      )}</AnimatePresence>
    </>
  );
}
