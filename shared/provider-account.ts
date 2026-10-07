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

export function hasUsableAccount(provider: ProviderInfo): boolean {
  return provider.enabled && (provider.available || Boolean(provider.instances?.some(entry => entry.available)));
}
