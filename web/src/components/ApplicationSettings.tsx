import { useEffect, useState } from "react";
import { ExternalLinkIcon } from "./icons/arrows.tsx";
import { MonitorIcon } from "./icons/hardware.tsx";
import { RefreshIcon, RotateCcwIcon } from "./icons/rotation.tsx";
import type { DesktopWindowState } from "../desktop.d.ts";
import { isRemote } from "../lib/environment.ts";
import { send } from "../lib/socket.ts";
import { confirmAction, useApp } from "../lib/store.ts";
import { useAppUpdate } from "../lib/use-app-update.ts";
import { AppUpdateControl } from "./AppUpdateControl.tsx";
import { ActionError } from "./ActionError.tsx";

export function ApplicationSettings({ active }: { active: boolean }) {
  const connected = useApp((state) => state.connected);
  const running = useApp((state) =>
    Object.values(state.threads).some((thread) => thread.running),
  );
  const [desktop, setDesktop] = useState<DesktopWindowState>();
  const { state: update } = useAppUpdate();
  const [applicationError, setApplicationError] = useState("");
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    void window.citropyDesktop?.windowState?.().then(setDesktop);
    return window.citropyDesktop?.onWindowState?.(setDesktop);
  }, []);
  const applyingUpdate = ["downloading", "ready", "installing"].includes(update.status);
  const development = useApp((state) => state.development);
  const restartServer = async () => {
    if (!(await confirmAction({
      title: "Restart the Citropy server?",
      description: desktop
        ? "The server and the desktop window restart and pick up code changes. Browser tabs close. Conversations are saved and terminals keep running."
        : "The server restarts and picks up code changes. This page reconnects when it is back. Conversations are saved and terminals keep running.",
      label: "Restart server",
    })))
      return;
    setApplicationError("");
    send({ t: "server.restart" });
  };
  const applicationAction = async (
    action: "reload" | "restart",
  ) => {
    setApplicationError("");
    if (
      action === "restart" &&
      !(await confirmAction({
        title: "Restart Citropy desktop?",
        description:
          "Browser pages will reload. Your conversations and terminals keep running on the local server.",
        label: "Restart desktop",
      }))
    )
      return;
    setUpdating(true);
    try {
      await window.citropyDesktop?.windowCommand(action);
    } catch (error) {
      setApplicationError((error as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  if (!active) return null;

  return (
    <>
      <div className="application-identity">
        <span>
          <MonitorIcon size={20} />
        </span>
        <div>
          <h2>{development ? "Citropy development" : "Citropy desktop"}</h2>
          <p>
            {desktop
              ? development
                ? `Version ${desktop.version} · Electron ${desktop.electron}`
                : `Version ${desktop.version}`
              : "Open the desktop app to use the embedded browser and window controls."}
          </p>
        </div>
      </div>
      <h2 className="settings-group-heading">Updates and restart</h2>
      <div className="settings-group">
        <div className="setting-row">
          <span>
            <strong>Citropy updates</strong>
            <small>You'll be notified when an update is available. Download and apply it when you choose.</small>
          </span>
          <AppUpdateControl variant="settings" />
        </div>
        {development && !isRemote() && (
          <div className="setting-row">
            <span>
              <strong>Live interface updates</strong>
              <small>Interface changes appear as you save. Development data is stored separately.</small>
            </span>
            <span>Live updates on</span>
          </div>
        )}
        {development && !isRemote() && (
          <div className="setting-row">
            <span>
              <strong>Restart server</strong>
              <small>
                {running
                  ? "Available when active conversations have finished."
                  : "Development only. Stops the server and starts a fresh one with your latest code."}
              </small>
            </span>
            <button
              type="button"
              className="btn"
              disabled={!connected || updating || running}
              onClick={() => void restartServer()}
            >
              <RotateCcwIcon size={14} />
              Restart server
            </button>
          </div>
        )}
        {desktop ? (
          <>
            <div className="setting-row">
              <span>
                <strong>Reload interface</strong>
                <small>{" "}Refresh the window while conversations and terminals keep running.{" "}</small>
              </span>
              <button
                type="button"
                className="btn"
                disabled={updating}
                onClick={() => void applicationAction("reload")}
              >
                <RefreshIcon size={14} />{" "}Reload{" "}</button>
            </div>
            <div className="setting-row">
              <span>
                <strong>Restart desktop</strong>
                <small>
                  {applyingUpdate
                    ? "Use Restart & apply to install the downloaded update."
                    : running
                      ? "Available when active conversations have finished."
                      : "Restart the app and reopen your browser tabs."}
                </small>
              </span>
              <button
                type="button"
                className="btn"
                disabled={!connected || updating || running || applyingUpdate}
                onClick={() => void applicationAction("restart")}
              >
                <RotateCcwIcon size={14} />{" "}Restart{" "}</button>
            </div>
          </>
        ) : (
          <div className="setting-row">
            <span>
              <strong>Desktop app</strong>
              <small>{" "}Use native browsing, notifications, and window controls.{" "}</small>
            </span>
            <button
              type="button"
              className="btn"
              disabled={!connected}
              onClick={() => send({ t: "desktop.open" })}
            >
              <ExternalLinkIcon size={14} />{" "}Open desktop{" "}</button>
          </div>
        )}
      </div>
      <ActionError className="dialog-error" message={applicationError} onDismiss={() => setApplicationError("")} />
      {development && !isRemote() && <p className="settings-note">Interface edits update live. Restart the desktop after changing its native code. Server changes require restarting the local server after active work has finished.</p>}
    </>
  );
}
