import { networkInterfaces } from "node:os";
import { port } from "../config.ts";
import { writeLog } from "../logs.ts";
import { firewallBlock, subnetOf, type FirewallBlock } from "./firewall.ts";
import { createDeviceProxy, type DeviceProxy } from "./proxy.ts";

const SETTINGS = {
  rescanIntervalMs: 30_000,
};

export interface LanState {
  addresses: string[];
  error?: string;
  firewall?: FirewallBlock;
}

const listeners = new Map<string, DeviceProxy>();
let listenError: string | undefined;
let rescan: NodeJS.Timeout | undefined;
let subnets = new Map<string, string>();

function privateAddress(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}

function lanAddresses(): Map<string, string> {
  return new Map(Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal && privateAddress(entry.address) && entry.cidr)
    .map((entry) => [entry!.address, entry!.cidr!]));
}

function listen(): void {
  const wanted = lanAddresses();
  subnets = new Map([...wanted].map(([address, cidr]) => [address, subnetOf(cidr)]));
  for (const [address, proxy] of listeners)
    if (!wanted.has(address)) {
      proxy.close();
      listeners.delete(address);
    }
  for (const address of wanted.keys()) {
    if (listeners.has(address)) continue;
    const proxy = createDeviceProxy("lan");
    proxy.server.on("error", (error: NodeJS.ErrnoException) => {
      listeners.delete(address);
      listenError = error.code === "EADDRINUSE" ? `Port ${port} on ${address} is already in use.` : error.message;
      writeLog("error", "sharing", listenError);
    });
    proxy.server.listen(port, address, () => { listenError = undefined; });
    listeners.set(address, proxy);
  }
}

export function startLan(): void {
  listen();
  rescan ??= setInterval(listen, SETTINGS.rescanIntervalMs);
  rescan.unref();
}

export function stopLan(): void {
  clearInterval(rescan);
  rescan = undefined;
  for (const proxy of listeners.values()) proxy.close();
  listeners.clear();
}

export function primarySubnet(): string | undefined {
  const [address] = listeners.keys();
  return address ? subnets.get(address) : undefined;
}

export function lanOrigin(): string | undefined {
  const [address] = listeners.keys();
  return address ? `http://${address}:${port}` : undefined;
}

export function lanState(enabled: boolean): LanState {
  const subnet = primarySubnet();
  const firewall = enabled && subnet ? firewallBlock(port, subnet) : undefined;
  return {
    addresses: [...listeners.keys()].map((address) => `http://${address}:${port}`),
    ...(listenError ? { error: listenError } : {}),
    ...(firewall ? { firewall } : {}),
  };
}
