import { store } from "./store.ts";
import { providerAccount } from "../shared/provider-account.ts";
import type { ProviderId, ProviderInfo, ProviderInstance } from "../shared/protocol.ts";
import type { ProviderLaunch } from "./providers/types.ts";
import { providers } from "./providers/index.ts";
import { removeAccountHome } from "./provider-account-home.ts";

const ACCOUNT_UNAVAILABLE = "This provider account is unavailable. Restore it in Settings > Providers.";

export function resolveProviderAccount(provider: ProviderId, instanceId?: string): { instance: ProviderInstance | undefined; launch: ProviderLaunch } {
  const instance = instanceId ? store.providerInstances.get(instanceId) : undefined;
  if (instanceId && instance?.provider !== provider) throw new Error(ACCOUNT_UNAVAILABLE);
  return { instance, launch: { instanceId: instance?.id, binary: instance?.binary, environment: instance?.environment } };
}

export function usableProviderAccount(provider: ProviderInfo | undefined, instanceId?: string | null): ReturnType<typeof providerAccount> & { provider: ProviderInfo } {
  const account = providerAccount(provider, instanceId);
  if (!provider || !account.usable) throw new Error("Select an enabled, installed provider account.");
  return { ...account, provider };
}

export async function removeProviderAccount(id: string): Promise<void> {
  const instance = store.providerInstances.get(id);
  store.removeProviderInstance(id);
  if (!instance) return;
  await providers[instance.provider].removeAccount?.(id);
  await removeAccountHome(instance);
}
