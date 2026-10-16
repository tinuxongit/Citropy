import { port } from "../config.ts";
import { onShutdown } from "../lifecycle.ts";
import { remoteId } from "../remote.ts";
import {
  clearPairingCodes,
  createPairingCode,
  forgetDevice,
  publicDevices,
  saveSharingSettings,
  sharingSettings,
  type PublicDevice,
  type Route,
} from "./devices.ts";
import { allowThroughFirewall } from "./firewall.ts";
import { lanOrigin, lanState, primarySubnet, startLan, stopLan, type LanState } from "./lan.ts";
import {
  allowTailscaleOperator,
  shutDownTailscale,
  startTailscale,
  stopTailscale,
  tailscaleState,
  type TailscaleState,
} from "./tailscale.ts";

export { DEVICE_HEADER } from "./proxy.ts";

export interface SharingState extends LanState {
  enabled: boolean;
  tailscale: TailscaleState;
  devices: PublicDevice[];
}

function requireHost(): void {
  if (remoteId) throw new Error("Phone access is available only on the computer running Citropy.");
}

export function sharingState(): SharingState {
  return {
    enabled: sharingSettings.enabled,
    ...lanState(sharingSettings.enabled),
    tailscale: tailscaleState(),
    devices: publicDevices(),
  };
}

export function setSharing(enabled: boolean): SharingState {
  requireHost();
  sharingSettings.enabled = enabled;
  saveSharingSettings();
  if (enabled) startLan();
  else stopLan();
  if (!enabled && !sharingSettings.tailscale) clearPairingCodes();
  return sharingState();
}

export async function setTailscaleSharing(enabled: boolean): Promise<SharingState> {
  requireHost();
  sharingSettings.tailscale = enabled;
  saveSharingSettings();
  if (enabled) startTailscale();
  else await stopTailscale();
  if (!enabled && !sharingSettings.enabled) clearPairingCodes();
  return sharingState();
}

function routeOrigin(route: Route): string {
  if (route === "tailscale") {
    const { url } = tailscaleState();
    if (!url) throw new Error("Tailscale sharing is not ready yet.");
    return url.replace(/\/$/, "");
  }
  if (!sharingSettings.enabled) throw new Error("Turn on Wi-Fi sharing first.");
  const origin = lanOrigin();
  if (!origin) throw new Error("No Wi-Fi or local network connection was found on this computer.");
  return origin;
}

export function createPairing(route: Route): { url: string; expiresAt: number } {
  const origin = routeOrigin(route);
  const { code, expiresAt } = createPairingCode();
  return { url: `${origin}/pair?code=${code}`, expiresAt };
}

export async function openFirewall(): Promise<SharingState> {
  const subnet = primarySubnet();
  if (!subnet) throw new Error("No Wi-Fi or local network connection was found on this computer.");
  await allowThroughFirewall(port, subnet);
  return sharingState();
}

export async function fixTailscale(): Promise<SharingState> {
  await allowTailscaleOperator();
  return sharingState();
}

export function removeDevice(id: string): SharingState {
  forgetDevice(id);
  return sharingState();
}

if (!remoteId) {
  if (sharingSettings.enabled) startLan();
  if (sharingSettings.tailscale) startTailscale();
}
onShutdown(() => {
  stopLan();
  shutDownTailscale();
});
