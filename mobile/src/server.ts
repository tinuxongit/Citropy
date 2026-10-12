import { CapacitorHttp } from "@capacitor/core";

const SETTINGS = {
  probeTimeoutMs: 4000,
};

const SERVER_KEY = "citropy.server";
const PAIRING_PATH = "/pair";
export const UNPAIRED_STATUS = 401;

export class PairingLinkError extends Error {}

export async function serverStatus(origin: string): Promise<number | undefined> {
  const response = await CapacitorHttp.get({ url: origin, connectTimeout: SETTINGS.probeTimeoutMs, readTimeout: SETTINGS.probeTimeoutMs }).catch(() => undefined);
  return response?.status;
}

export function pairingOrigin(link: string): string {
  const url = URL.parse(link.trim());
  if (!url || url.pathname !== PAIRING_PATH || !url.searchParams.get("code")) throw new PairingLinkError("That isn't a Citropy pairing code. Open Settings > Phone access on your computer and scan the code there.");
  return url.origin;
}

export const savedServer = () => localStorage.getItem(SERVER_KEY);

export function saveServer(origin: string) {
  localStorage.setItem(SERVER_KEY, origin);
}
