import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import type { NodeRuntimeStatus } from "../../../shared/runtime-downloads.ts";
import { api } from "../lib/api.ts";
import { useApp } from "../lib/store.ts";
import { PixelLoader } from "./PixelLoader.tsx";

export function RuntimeDownloads({ onInstalled }: { onInstalled: () => void }) {
  const connected = useApp(state => state.connected);
  const [runtime, setRuntime] = useState<NodeRuntimeStatus>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let installing = refresh > 0;
    const load = async () => {
      try {
        const value = await api<NodeRuntimeStatus>("runtimes/node", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRuntime(value);
        setError("");
        if (value.status === "installing") {
          installing = true;
          timer = setTimeout(() => void load(), 1000);
        } else if (installing && value.status === "success") {
          installing = false;
          onInstalled();
        }
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connected, refresh, onInstalled]);

  const install = async () => {
    setStarting(true);
    setError("");
    try {
      setRuntime(await api<NodeRuntimeStatus>("runtimes/node", { method: "POST" }));
      setRefresh(value => value + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setStarting(false);
    }
  };
  const busy = starting || runtime?.status === "installing";

  return <>
    <h2 className="settings-group-heading settings-group-spaced">Runtime downloads</h2>
    <div className="settings-group" aria-label="Runtime downloads">
      <div className="setting-row">
        <span>
          <strong>Node.js</strong>
          <small>{runtime?.ready
            ? `Node ${runtime.version ?? ""} · npm ${runtime.npmVersion ?? ""}`
            : "Node.js and npm for provider installation and development."}</small>
        </span>
        {runtime?.ready && runtime.shellReady !== false && runtime.status !== "error" && !busy ? <span className="provider-up-to-date"><Check size={14} />Installed</span>
          : <button className="btn" type="button" disabled={!connected || !runtime?.supported || busy}
            onClick={() => void install()}>{busy ? <PixelLoader size={14} /> : <Download size={14} />}
            {busy ? "Installing…" : runtime?.ready ? "Set up terminals" : "Install Node.js"}</button>}
      </div>
    </div>
    {runtime && !runtime.supported && !runtime.ready &&
      <p className="settings-note">Automatic installation supports Linux, macOS, and Windows on x64 or ARM64.</p>}
    {(error || runtime?.message) && <p className="provider-update-result"
      data-status={error ? "error" : runtime?.status} role={error || runtime?.status === "error" ? "alert" : "status"}>
      {error || runtime?.message}
      {error && <button className="btn" onClick={() => setRefresh(value => value + 1)}>Retry</button>}
    </p>}
  </>;
}
