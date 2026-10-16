import { tmpdir } from "node:os";
import type {
  QuotaDetail,
  SubscriptionUsage,
  UsageReadResult,
} from "@muse-code/sdk/dist/src/msp.js";
import type { ProviderLaunch } from "../types.ts";
import { MuseHost } from "./host.ts";

const MINUTE_MS = 60_000;

const observed = new Map<string, SubscriptionUsage>();

function accountKey(instanceId: string | undefined): string {
  return instanceId ?? "";
}

export function recordMuseUsage(instanceId: string | undefined, usage: SubscriptionUsage): void {
  const key = accountKey(instanceId);
  if ((observed.get(key)?.observedAtMs ?? 0) <= usage.observedAtMs) observed.set(key, usage);
}

export async function readMuseUsage(
  launch: ProviderLaunch = {},
): Promise<SubscriptionUsage | undefined> {
  const host = await MuseHost.start({
    launch,
    cwd: tmpdir(),
    access: "readOnly",
    sessionLog: false,
  });
  try {
    const { usage } = await host.request<UsageReadResult>("usage/read");
    if (usage) recordMuseUsage(launch.instanceId, usage);
  } finally {
    await host.close();
  }
  return observed.get(accountKey(launch.instanceId));
}

export function quotaMessage(quota: QuotaDetail, now = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((quota.resetsAtMs - now) / MINUTE_MS));
  return `Muse Code reached its usage limit. Try again in ${minutes} minutes.`;
}
