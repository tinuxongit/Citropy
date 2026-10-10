import type { ModelOption, ProviderInfo } from "./protocol.ts";

export type ProviderAccountInfo = NonNullable<ProviderInfo["instances"]>[number];

export function providerAccount(provider: ProviderInfo | undefined, instanceId?: string | null): { instance: ProviderAccountInfo | undefined; models: ModelOption[]; usable: boolean } {
  const instance = instanceId ? provider?.instances?.find(entry => entry.id === instanceId) : undefined;
  return {
    instance,
    models: (instanceId ? instance : provider)?.models ?? [],
    usable: Boolean(provider?.enabled && (instanceId ? instance?.available : provider.available)),
  };
}

export function activeAccountId(provider: ProviderInfo): string | undefined {
  if (provider.activeInstanceId) return provider.activeInstanceId;
  return provider.available ? undefined : provider.instances?.find(entry => entry.available)?.id;
}

export function hasUsableAccount(provider: ProviderInfo): boolean {
  return providerAccount(provider, activeAccountId(provider)).usable;
}
