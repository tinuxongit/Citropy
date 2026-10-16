import { useEffect, useState } from "react";
import { CopyIcon, TrashIcon } from "./icons/actions.tsx";
import { renderSVG } from "uqr";
import { api, reportError } from "../lib/api.ts";
import { ago } from "../lib/format.ts";
import { useCopied } from "../lib/use-copied.ts";
import { useVisibleInterval } from "../lib/use-visible-interval.ts";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { androidDownloadUrl } from "../../../shared/release.mjs";

const SETTINGS = { pollMs: 3000 };

type Route = "tailscale" | "lan";

const ROUTE_LABELS: Record<Route, string> = { tailscale: "Tailscale", lan: "Wi-Fi" };

const PAIRING_HINTS: Record<Route, string> = {
  tailscale:
    "Scan with the Citropy app or your phone's camera. The phone needs the Tailscale app, signed in to the same tailnet, and then works from anywhere. Each code works once and changes every 5 minutes.",
  lan: "Scan with the Citropy app or your phone's camera while it is on this Wi-Fi. Each code works once and changes every 5 minutes.",
};

interface TailscaleState {
  status: "off" | "connecting" | "approval" | "on" | "problem";
  url?: string;
  message?: string;
  link?: { label: string; url: string };
  command?: string;
  canFix?: boolean;
}

interface SharingState {
  enabled: boolean;
  addresses: string[];
  error?: string;
  firewall?: { name: string; command: string; canFix: boolean };
  tailscale: TailscaleState;
  devices: Array<{ id: string; name: string; route: Route; createdAt: number; lastSeen: number }>;
}

interface Pairing {
  url: string;
  expiresAt: number;
}

function SharingNotice({
  message,
  link,
  command,
  fixLabel,
  onFix,
}: {
  message: string;
  link?: { label: string; url: string };
  command?: string;
  fixLabel?: string;
  onFix?: () => Promise<unknown>;
}) {
  const [copied, copy] = useCopied();
  const [fixing, setFixing] = useState(false);
  const fix = () => {
    setFixing(true);
    onFix!()
      .catch(reportError)
      .finally(() => setFixing(false));
  };
  return (
    <div className="sharing-notice" role="alert">
      <p>{message}</p>
      {link && (
        <a
          className="btn"
          data-variant="primary"
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          {link.label}
        </a>
      )}
      {onFix && (
        <button
          type="button"
          className="btn"
          data-variant="primary"
          disabled={fixing}
          onClick={fix}
        >
          {fixing ? "Waiting for your password…" : fixLabel}
        </button>
      )}
      {command && (
        <div className="sharing-address">
          <code className="truncate" title={command}>
            {command}
          </code>
          <button
            type="button"
            className="icon-btn"
            aria-label="Copy command"
            title={copied ? "Copied" : "Copy command"}
            onClick={() => copy(command)}
          >
            <CopyIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function TailscaleNotice({
  tailscale,
  onChange,
}: {
  tailscale: TailscaleState;
  onChange: (state: SharingState) => void;
}) {
  if (tailscale.status === "connecting")
    return <p className="settings-note">Connecting to Tailscale…</p>;
  if (tailscale.status !== "approval" && tailscale.status !== "problem") return null;
  const fix = tailscale.canFix
    ? () => api<SharingState>("sharing/tailscale/fix", { method: "POST" }).then(onChange)
    : undefined;
  return (
    <SharingNotice
      message={tailscale.message!}
      link={tailscale.link}
      command={tailscale.command}
      fixLabel="Give permission"
      onFix={fix}
    />
  );
}

export function PhoneAccess() {
  const [state, setState] = useState<SharingState>();
  const [pairing, setPairing] = useState<Pairing>();
  const [chosenRoute, setChosenRoute] = useState<Route>("tailscale");
  const [pairingCopied, copyPairing] = useCopied();
  const deviceCount = state?.devices.length ?? 0;
  const routes = (
    [
      state?.tailscale.status === "on" && "tailscale",
      state?.enabled && state.addresses.length && "lan",
    ] as const
  ).filter((route): route is Route => Boolean(route));
  const route = routes.includes(chosenRoute) ? chosenRoute : routes[0];
  const routeAddress = route === "tailscale" ? state?.tailscale.url : state?.addresses[0];

  const load = () => api<SharingState>("sharing").then(setState).catch(reportError);
  useEffect(() => {
    void load();
  }, []);
  useVisibleInterval(load, SETTINGS.pollMs);

  useEffect(() => {
    if (!route) {
      setPairing(undefined);
      return;
    }
    let alive = true;
    let timer = 0;
    const refresh = () =>
      api<Pairing>(`sharing/pair?route=${route}`, { method: "POST" })
        .then((value) => {
          if (!alive) return;
          setPairing(value);
          timer = window.setTimeout(refresh, Math.max(1000, value.expiresAt - Date.now()));
        })
        .catch(reportError);
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [route, routeAddress, deviceCount]);

  const toggleLan = (enabled: boolean) =>
    api<SharingState>("sharing", { method: "PUT", body: JSON.stringify({ enabled }) })
      .then(setState)
      .catch(reportError);
  const toggleTailscale = (enabled: boolean) =>
    api<SharingState>("sharing/tailscale", { method: "PUT", body: JSON.stringify({ enabled }) })
      .then(setState)
      .catch(reportError);
  const remove = (device: string) =>
    api<SharingState>(`sharing/devices?id=${encodeURIComponent(device)}`, { method: "DELETE" })
      .then(setState)
      .catch(reportError);
  const unblock = () => api<SharingState>("sharing/firewall", { method: "POST" }).then(setState);

  return (
    <>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Share over Tailscale</strong>
            <small>
              Lets your phone or tablet open this Citropy from anywhere over HTTPS, through your
              private Tailscale network.
            </small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={state ? state.tailscale.status !== "off" : false}
            disabled={!state}
            onChange={(event) => void toggleTailscale(event.target.checked)}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Share on this Wi-Fi</strong>
            <small>
              Lets your phone or tablet on the same Wi-Fi open this Citropy after scanning a code.
            </small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={state?.enabled ?? false}
            disabled={!state}
            onChange={(event) => void toggleLan(event.target.checked)}
          />
        </label>
      </div>
      {state && <TailscaleNotice tailscale={state.tailscale} onChange={setState} />}
      {state?.error && (
        <p className="sharing-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.enabled && !state.addresses.length && !state.error && (
        <p className="settings-note">
          No Wi-Fi or local network connection was found on this computer.
        </p>
      )}
      {state?.firewall && (
        <SharingNotice
          message="This computer's firewall blocks other devices, so phones on the Wi-Fi can't connect yet."
          command={state.firewall.command}
          fixLabel="Allow through firewall"
          onFix={state.firewall.canFix ? unblock : undefined}
        />
      )}
      {pairing && route && (
        <>
          {routes.length > 1 && (
            <div
              className="segmented-tabs sliding-selection sharing-routes"
              role="group"
              aria-label="Pair over"
            >
              <SelectionHighlight value={route} />
              {routes.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={entry === route}
                  onClick={() => setChosenRoute(entry)}
                >
                  {ROUTE_LABELS[entry]}
                </button>
              ))}
            </div>
          )}
          <div className="sharing-pairing">
            <div
              className="sharing-qr"
              role="img"
              aria-label="Pairing QR code"
              dangerouslySetInnerHTML={{ __html: renderSVG(pairing.url, { border: 2 }) }}
            />
            <div className="sharing-pairing-details">
              <p>{PAIRING_HINTS[route]}</p>
              <div className="sharing-address">
                <span className="truncate" title={routeAddress}>
                  {routeAddress}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Copy pairing link"
                  title={pairingCopied ? "Copied" : "Copy pairing link"}
                  onClick={() => copyPairing(pairing.url)}
                >
                  <CopyIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <h2 className="settings-group-heading">Android app</h2>
      <div className="sharing-pairing">
        <div
          className="sharing-qr"
          role="img"
          aria-label="Android app download QR code"
          dangerouslySetInnerHTML={{ __html: renderSVG(androidDownloadUrl, { border: 2 }) }}
        />
        <div className="sharing-pairing-details">
          <p>
            Scan to download Citropy for Android. Open the file to install it, then scan the pairing
            code from the app.
          </p>
        </div>
      </div>
      {deviceCount > 0 && (
        <>
          <h2 className="settings-group-heading">Paired devices</h2>
          <div className="settings-group">
            {state!.devices.map((device) => (
              <div className="setting-row" key={device.id}>
                <span>
                  <strong>{device.name}</strong>
                  <small>
                    Paired over {ROUTE_LABELS[device.route]}. Last used {ago(device.lastSeen)}
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${device.name}`}
                  title="Remove device"
                  onClick={() => void remove(device.id)}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
