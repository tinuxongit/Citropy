import { bus } from "../bus.ts";
import { clearCommandCache } from "./binary.ts";
import { describeProviders } from "./index.ts";
import { providerSignIns } from "./provider-sign-in.ts";
import { store } from "../store.ts";
import type { ProviderInfo } from "../../shared/protocol.ts";
import type { ProviderSignIn } from "../../shared/provider-settings.ts";

const THROTTLE = 30_000;
const MODELS_MAX_AGE = 15 * 60_000;

let info: ProviderInfo[] = [];
let signIns: ProviderSignIn[] = [];
let refreshing: Promise<void> | null = null;
let lastRefresh = 0;

function signedIn(provider: ProviderInfo["id"], instanceId?: string): boolean | undefined {
  return signIns.find((entry) => entry.provider === provider && entry.instanceId === instanceId)?.signedIn;
}

function withSettings(providers: ProviderInfo[]): ProviderInfo[] {
  return providers.map((provider) => ({
    ...provider,
    enabled: !store.disabledProviders.has(provider.id),
    signedIn: signedIn(provider.id),
    activeInstanceId: store.activeAccounts.get(provider.id),
    instances: provider.instances?.map((instance) => ({ ...instance, signedIn: signedIn(provider.id, instance.id) })),
  }));
}

function publishIfChanged(next: ProviderInfo[]): void {
  if (JSON.stringify(next) === JSON.stringify(info)) return;
  info = next;
  bus.emit({ t: "providers.update", providers: info });
}

export function providerInfo(): ProviderInfo[] {
  return info;
}

export function refreshProviders(force = false): Promise<void> {
  if (refreshing) return force ? refreshing.then(() => refreshProviders(true)) : refreshing;
  if (!force && Date.now() - lastRefresh < THROTTLE) return Promise.resolve();
  if (force) clearCommandCache();
  refreshing = Promise.all([describeProviders(force ? 0 : MODELS_MAX_AGE), providerSignIns()])
    .then(([described, latest]) => {
      signIns = latest;
      lastRefresh = Date.now();
      publishIfChanged(withSettings(described));
    })
    .catch((error) => {
      process.stderr.write(`Could not refresh providers: ${(error as Error).message}\n`);
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function publishProviderStatus(): void {
  info = withSettings(info);
  bus.emit({ t: "providers.update", providers: info });
}

export async function refreshProvidersNow(): Promise<void> {
  if (refreshing) await refreshing;
  await refreshProviders(true);
}

function signInKey(list: ProviderSignIn[]): string {
  return JSON.stringify(list.map((entry) => [entry.provider, entry.instanceId, entry.signedIn]));
}

export async function refreshSignIns(): Promise<ProviderSignIn[]> {
  const latest = await providerSignIns();
  const changed = signInKey(latest) !== signInKey(signIns);
  signIns = latest;
  publishIfChanged(withSettings(info));
  if (changed) void refreshProviders(true);
  return latest;
}
