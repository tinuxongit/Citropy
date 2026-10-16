import { existsSync, readFileSync } from "node:fs";
import { unlessCode } from "../../shared/expected-errors.mjs";
import { canRunAsAdmin, runAsAdmin } from "../admin-command.ts";

export interface FirewallBlock {
  name: "ufw";
  command: string;
  canFix: boolean;
}

const userRulesPath = "/etc/ufw/user.rules";
const granted = new Set<string>();

const ufw = ["/usr/bin/ufw", "/usr/sbin/ufw"].find(existsSync);

function setting(file: string, name: string): string | undefined {
  if (!existsSync(file)) return undefined;
  return new RegExp(`^${name}="?([^"\\n]*)"?`, "m").exec(readFileSync(file, "utf8"))?.[1];
}

function coversPort(ports: string, port: number): boolean {
  return ports.split(",").some((entry) => {
    const [low, high] = entry.split(":").map(Number);
    return high === undefined ? low === port : low! <= port && port <= high;
  });
}

const grantKey = (port: number, subnet: string) => `${port} ${subnet}`;

function ufwAllows(port: number): boolean {
  let rules: string;
  try {
    rules = readFileSync(userRulesPath, "utf8");
  } catch (error) {
    return unlessCode(["EACCES"], false)(error);
  }
  return [...rules.matchAll(/^### tuple ### allow (\S+) (\S+) /gm)].some(
    ([, protocol, ports]) =>
      (protocol === "tcp" || protocol === "any") && ports !== "any" && coversPort(ports!, port),
  );
}

function ufwArguments(port: number, subnet: string): string[] {
  return [
    "allow",
    "from",
    subnet,
    "to",
    "any",
    "port",
    String(port),
    "proto",
    "tcp",
    "comment",
    "Citropy phone access",
  ];
}

export function subnetOf(cidr: string): string {
  const [address, bits] = cidr.split("/");
  const prefix = Number(bits);
  const value = address!.split(".").reduce((total, part) => (total << 8) + Number(part), 0) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (value & mask) >>> 0;
  return `${[24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join(".")}/${prefix}`;
}

export function firewallBlock(port: number, subnet: string): FirewallBlock | undefined {
  if (process.platform !== "linux" || !ufw) return undefined;
  if (setting("/etc/ufw/ufw.conf", "ENABLED") !== "yes") return undefined;
  if (!["DROP", "REJECT"].includes(setting("/etc/default/ufw", "DEFAULT_INPUT_POLICY") ?? ""))
    return undefined;
  if (granted.has(grantKey(port, subnet)) || ufwAllows(port)) return undefined;
  return {
    name: "ufw",
    command: `sudo ufw ${ufwArguments(port, subnet)
      .map((part) => (part.includes(" ") ? `'${part}'` : part))
      .join(" ")}`,
    canFix: canRunAsAdmin,
  };
}

export async function allowThroughFirewall(port: number, subnet: string): Promise<void> {
  if (!ufw) throw new Error("No supported firewall was found on this computer.");
  await runAsAdmin([ufw, ...ufwArguments(port, subnet)], "firewall change");
  granted.add(grantKey(port, subnet));
}
