import { useEffect, useState } from "react";
import { CheckIcon } from "../icons/marks.tsx";
import { DownloadIcon } from "../icons/arrows.tsx";
import type { RuntimeStatus } from "../../../../shared/runtime-downloads.ts";
import { api } from "../../lib/api.ts";
import { useApp } from "../../lib/store.ts";
import { Loader } from "../Loader.tsx";

const POLL_INTERVAL = 1000;

export interface Runtime<Status extends RuntimeStatus> {
  id: string;
  label: string;
  installLabel: string;
  purpose(status?: Status): string;
  installed(status: Status): string;
  unsupported(status: Status): string;
  pendingSetup?: { label: string; needed(status: Status): boolean };
}

export function RuntimeRow<Status extends RuntimeStatus>({ runtime, onInstalled }: { runtime: Runtime<Status>; onInstalled?: () => void }) {
  const connected = useApp(state => state.connected);
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [starting, setStarting] = useState(false);
  const path = `runtimes/${runtime.id}`;

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let installing = refresh > 0;
    const load = async () => {
      try {
        const value = await api<Status>(path, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setStatus(value);
        setError("");
        if (value.status === "installing") {
          installing = true;
          timer = setTimeout(() => void load(), POLL_INTERVAL);
        } else if (installing && value.status === "success") {
          installing = false;
          onInstalled?.();
        }
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connected, refresh, onInstalled, path]);

  const install = async () => {
    setStarting(true);
    setError("");
    try {
      setStatus(await api<Status>(path, { method: "POST" }));
      setRefresh(value => value + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setStarting(false);
    }
  };
  const busy = starting || status?.status === "installing";
  const needsSetup = status?.ready && runtime.pendingSetup?.needed(status);
  const done = status?.ready && !needsSetup && status.status !== "error" && !busy;

  return (
    <div className="setting-row">
      <span>
        <strong>{runtime.label}</strong>
        <small>{status?.ready ? runtime.installed(status) : runtime.purpose(status)}</small>
        {status && !status.supported && !status.ready && <small>{runtime.unsupported(status)}</small>}
        {(error || status?.message) && <small className="provider-update-result"
          data-status={error ? "error" : status?.status} role={error || status?.status === "error" ? "alert" : "status"}>
          {error || status?.message}
          {error && <button className="btn" onClick={() => setRefresh(value => value + 1)}>Retry</button>}
        </small>}
      </span>
      {done ? <span className="provider-up-to-date"><CheckIcon size={14} />Installed</span>
        : <button className="btn" type="button" disabled={!connected || !status?.supported || busy}
          onClick={() => void install()}>{busy ? <Loader size={14} /> : <DownloadIcon size={14} />}
          {busy ? "Installing…" : needsSetup ? runtime.pendingSetup!.label : runtime.installLabel}</button>}
    </div>
  );
}
