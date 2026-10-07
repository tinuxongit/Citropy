import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { renderSVG } from "uqr";
import { api, reportError } from "../lib/api.ts";
import { isRemote } from "../lib/environment.ts";
import { ago } from "../lib/format.ts";
import { useCopied } from "../lib/use-copied.ts";
import { useVisibleInterval } from "../lib/use-visible-interval.ts";

const SETTINGS = { pollMs: 3000 };

interface SharingState {
  enabled: boolean;
  addresses: string[];
  error?: string;
  firewall?: { name: string; command: string; canFix: boolean };
  devices: Array<{ id: string; name: string; createdAt: number; lastSeen: number }>;
}

interface Pairing {
  url: string;
  expiresAt: number;
}

export const canShareLocally = () => ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname) && !isRemote();

export function LocalSharing() {
  const [state, setState] = useState<SharingState>();
  const [pairing, setPairing] = useState<Pairing>();
  const [pairingCopied, copyPairing] = useCopied();
  const [firewallCopied, copyFirewall] = useCopied();
  const [unblocking, setUnblocking] = useState(false);
  const deviceCount = state?.devices.length ?? 0;

  const load = () => api<SharingState>("sharing").then(setState).catch(reportError);
  useEffect(() => { void load(); }, []);
  useVisibleInterval(load, SETTINGS.pollMs);

  useEffect(() => {
    if (!state?.enabled || !state.addresses.length) {
      setPairing(undefined);
      return;
    }
    let alive = true;
    let timer = 0;
    const refresh = () => api<Pairing>("sharing/pair", { method: "POST" }).then((value) => {
      if (!alive) return;
      setPairing(value);
      timer = window.setTimeout(refresh, Math.max(1000, value.expiresAt - Date.now()));
    }).catch(reportError);
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [state?.enabled, state?.addresses.length, deviceCount]);

  const toggle = (enabled: boolean) => api<SharingState>("sharing", { method: "PUT", body: JSON.stringify({ enabled }) }).then(setState).catch(reportError);
  const remove = (device: string) => api<SharingState>(`sharing/devices?id=${encodeURIComponent(device)}`, { method: "DELETE" }).then(setState).catch(reportError);
  const unblock = () => {
    setUnblocking(true);
    api<SharingState>("sharing/firewall", { method: "POST" }).then(setState).catch(reportError).finally(() => setUnblocking(false));
  };

  return (
    <>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Share on this Wi-Fi</strong>
            <small>Lets your phone or tablet on the same Wi-Fi open this Citropy after scanning a code.</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch" checked={state?.enabled ?? false} disabled={!state} onChange={(event) => void toggle(event.target.checked)} />
        </label>
      </div>
      {state?.error && <p className="sharing-error" role="alert">{state.error}</p>}
      {state?.enabled && !state.addresses.length && !state.error && <p className="settings-note">No Wi-Fi or local network connection was found on this computer.</p>}
      {state?.firewall && (
        <div className="sharing-firewall" role="alert">
          <p>This computer's firewall blocks other devices, so phones can't connect yet.</p>
          {state.firewall.canFix && <button type="button" className="btn" data-variant="primary" disabled={unblocking} onClick={unblock}>{unblocking ? "Waiting for your password…" : "Allow through firewall"}</button>}
          <div className="sharing-address">
            <code className="truncate" title={state.firewall.command}>{state.firewall.command}</code>
            <button type="button" className="icon-btn" aria-label="Copy firewall command" title={firewallCopied ? "Copied" : "Copy firewall command"} onClick={() => copyFirewall(state.firewall!.command)}><Copy size={14} /></button>
          </div>
        </div>
      )}
      {pairing && (
        <div className="sharing-pairing">
          <div className="sharing-qr" role="img" aria-label="Pairing QR code" dangerouslySetInnerHTML={{ __html: renderSVG(pairing.url, { border: 2 }) }} />
          <div className="sharing-pairing-details">
            <p>Scan with your phone's camera. Each code works once and changes every 5 minutes.</p>
            <div className="sharing-address">
              <span className="truncate" title={state?.addresses[0]}>{state?.addresses[0]}</span>
              <button type="button" className="icon-btn" aria-label="Copy pairing link" title={pairingCopied ? "Copied" : "Copy pairing link"} onClick={() => copyPairing(pairing.url)}><Copy size={14} /></button>
            </div>
          </div>
        </div>
      )}
      {deviceCount > 0 && (
        <>
          <h2 className="settings-group-heading">Paired devices</h2>
          <div className="settings-group">
            {state!.devices.map((device) => (
              <div className="setting-row" key={device.id}>
                <span>
                  <strong>{device.name}</strong>
                  <small>Last used {ago(device.lastSeen)}</small>
                </span>
                <button type="button" className="icon-btn" aria-label={`Remove ${device.name}`} title="Remove device" onClick={() => void remove(device.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
