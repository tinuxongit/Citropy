import type { ModelOption, ProviderInfo } from "./protocol.ts";

export type ProviderAccountInfo = NonNullable<ProviderInfo["instances"]>[number];

function ready(account: Pick<ProviderInfo, "available" | "signedIn"> | undefined): boolean {
  return Boolean(account?.available && account.signedIn);
}

export function providerAccount(provider: ProviderInfo | undefined, instanceId?: string | null): { instance: ProviderAccountInfo | undefined; models: ModelOption[]; usable: boolean } {
  const instance = instanceId ? provider?.instances?.find(entry => entry.id === instanceId) : undefined;
  return {
    instance,
    models: (instanceId ? instance : provider)?.models ?? [],
    usable: Boolean(provider?.enabled && ready(instanceId ? instance : provider)),
  };
}

export function activeAccountId(provider: ProviderInfo): string | undefined {
  if (provider.activeInstanceId) return provider.activeInstanceId;
  return ready(provider) ? undefined : provider.instances?.find(ready)?.id;
}

export function hasUsableAccount(provider: ProviderInfo): boolean {
  return providerAccount(provider, activeAccountId(provider)).usable;
}

export function hasReadyAccount(provider: ProviderInfo): boolean {
  return ready(provider) || Boolean(provider.instances?.some(ready));
}
