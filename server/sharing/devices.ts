import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { dataRoot } from "../paths.ts";

const SETTINGS = {
  pairingLifetimeMs: 5 * 60_000,
  lastSeenSaveIntervalMs: 60_000,
};

export type Route = "lan" | "tailscale";

export const DEVICE_COOKIE = "citropy_device";

interface Device {
  id: string;
  name: string;
  route: Route;
  tokenHash: string;
  createdAt: number;
  lastSeen: number;
}

export type PublicDevice = Omit<Device, "tokenHash">;

interface Saved {
  enabled: boolean;
  tailscale: boolean;
  tailscalePort?: number;
  devices: Device[];
}

const file = join(dataRoot, "lan-sharing.json");
const pairings = new Map<string, number>();
const openConnections = new Map<string, Set<Duplex>>();
let lastSeenSaved = 0;

export const sharingSettings: Saved = load();

function load(): Saved {
  if (!existsSync(file)) return { enabled: false, tailscale: false, devices: [] };
  const data = JSON.parse(readFileSync(file, "utf8")) as Partial<Saved>;
  return {
    enabled: data.enabled === true,
    tailscale: data.tailscale === true,
    ...(typeof data.tailscalePort === "number" ? { tailscalePort: data.tailscalePort } : {}),
    devices: Array.isArray(data.devices) ? data.devices.map((device) => ({ ...device, route: device.route ?? "lan" })) : [],
  };
}

export function saveSharingSettings(): void {
  writeFileSync(file, JSON.stringify(sharingSettings, null, 2), { mode: 0o600 });
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function deviceName(userAgent = ""): string {
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? "Android phone" : "Android tablet";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows computer";
  return "Browser";
}

export function createPairingCode(): { code: string; expiresAt: number } {
  const code = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + SETTINGS.pairingLifetimeMs;
  for (const [key, expiry] of pairings) if (expiry < Date.now()) pairings.delete(key);
  pairings.set(hash(code), expiresAt);
  return { code, expiresAt };
}

export function redeemPairingCode(code: string | null, route: Route, userAgent: string | undefined): string | undefined {
  const key = code ? hash(code) : "";
  const expiresAt = pairings.get(key);
  if (!expiresAt || expiresAt < Date.now()) return undefined;
  pairings.delete(key);
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  sharingSettings.devices.push({ id: randomUUID(), name: deviceName(userAgent), route, tokenHash: hash(token), createdAt: now, lastSeen: now });
  saveSharingSettings();
  return token;
}

export function clearPairingCodes(): void {
  pairings.clear();
}

export function authenticate(req: IncomingMessage): Device | undefined {
  const cookie = (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DEVICE_COOKIE}=`));
  if (!cookie) return undefined;
  const supplied = hash(cookie.slice(DEVICE_COOKIE.length + 1));
  const device = sharingSettings.devices.find((entry) => sameHash(entry.tokenHash, supplied));
  if (device) {
    device.lastSeen = Date.now();
    if (device.lastSeen - lastSeenSaved > SETTINGS.lastSeenSaveIntervalMs) {
      lastSeenSaved = device.lastSeen;
      saveSharingSettings();
    }
  }
  return device;
}

export function trackConnection(deviceId: string, connection: Duplex): void {
  let set = openConnections.get(deviceId);
  if (!set) openConnections.set(deviceId, (set = new Set()));
  set.add(connection);
  connection.once("close", () => set.delete(connection));
}

export function publicDevices(): PublicDevice[] {
  return sharingSettings.devices.map(({ tokenHash: _, ...device }) => device);
}

export function forgetDevice(id: string): void {
  sharingSettings.devices = sharingSettings.devices.filter((device) => device.id !== id);
  saveSharingSettings();
  for (const connection of openConnections.get(id) ?? []) connection.destroy();
  openConnections.delete(id);
}
