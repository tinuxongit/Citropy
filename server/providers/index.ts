import { claudeProvider } from "./claude.ts";
import { codexProvider } from "./codex.ts";
import { cursorProvider } from "./cursor.ts";
import { opencodeProvider } from "./opencode.ts";
import { piProvider } from "./pi.ts";
import type { Provider } from "./types.ts";
import type { ProviderId, ProviderInfo } from "../../shared/protocol.ts";

export const providers: Record<ProviderId, Provider> = {
  claude: claudeProvider,
  codex: codexProvider,
  cursor: cursorProvider,
  opencode: opencodeProvider,
  pi: piProvider,
};

import { store } from "../store.ts";

const lastInfo = new Map<ProviderId, ProviderInfo>();

export async function describeProviders(): Promise<ProviderInfo[]> {
  return Promise.all(Object.values(providers).map(async (provider) => {
    const previous = lastInfo.get(provider.id);
    const detected = store.disabledProviders.has(provider.id)
      ? { available: previous?.available ?? false, version: previous?.version }
      : await provider.detect();
    let models = previous?.models ?? provider.models;
    let modelsError: string | undefined;
    let modelsUpdatedAt = previous?.modelsUpdatedAt;
    if (detected.available && !store.disabledProviders.has(provider.id)) {
      try {
        const discovered = await provider.listModels();
        if (!discovered.length) throw new Error("No models returned");
        models = discovered;
        provider.models = discovered;
        modelsUpdatedAt = Date.now();
      } catch (error) {
        modelsError = `Could not refresh models: ${(error as Error).message}`;
      }
    }
    const info: ProviderInfo = {
      id: provider.id,
      label: provider.label,
      binary: provider.binary,
      models,
      supportsPermissionPrompt: provider.supportsPermissionPrompt,
      steerHint: provider.steerHint,
      capabilities: provider.capabilities,
      available: detected.available,
      enabled: !store.disabledProviders.has(provider.id),
      version: detected.version,
      modelsError,
      modelsUpdatedAt,
      instances: await Promise.all([...store.providerInstances.values()].filter(instance => instance.provider === provider.id).map(async instance => {
        const launch = { binary: instance.binary, environment: instance.environment };
        const previousInstance = previous?.instances?.find(entry => entry.id === instance.id);
        const detected = store.disabledProviders.has(provider.id)
          ? { available: previousInstance?.available ?? false, version: previousInstance?.version }
          : await provider.detect(launch);
        let models = previousInstance?.models ?? [];
        let modelsError: string | undefined;
        if (detected.available && !store.disabledProviders.has(provider.id)) {
          try {
            const discovered = await provider.listModels(launch);
            if (!discovered.length) throw new Error("No models returned");
            models = discovered;
          }
          catch (error) { modelsError = `Could not refresh models: ${(error as Error).message}`; }
        }
        return { id: instance.id, name: instance.name, available: detected.available, version: detected.version, models, modelsError };
      })),
    };
    lastInfo.set(provider.id, info);
    return info;
  }));
}
