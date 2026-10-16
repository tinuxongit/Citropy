import { tmpdir } from "node:os";
import type { ModelCatalogEntry, ModelListResult } from "@muse-code/sdk/dist/src/msp.js";
import type { ModelOption } from "../../../shared/protocol.ts";
import type { ProviderLaunch } from "../types.ts";
import { MUSE_PROVIDER, MuseHost } from "./host.ts";

const CATALOG_TIMEOUT_MS = 8_000;
const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const FALLBACK_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const FALLBACK_EFFORT = "high";

function modelOption(model: ModelCatalogEntry): ModelOption {
  const reported = Array.isArray(model.variants);
  const efforts = (reported ? (model.variants as string[]) : FALLBACK_EFFORTS).filter((effort) =>
    EFFORTS.includes(effort),
  );
  const preferred = reported ? model.defaultReasoningEffort : FALLBACK_EFFORT;
  const defaultEffort = efforts.find((effort) => effort === preferred) ?? efforts[0];
  return {
    id: model.modelId,
    label: model.displayLabel.trim() || model.modelId,
    ...(model.description ? { hint: model.description } : {}),
    ...(efforts.length ? { efforts } : {}),
    ...(defaultEffort ? { defaultEffort } : {}),
    ...(model.isDefault ? { isDefault: true } : {}),
    ...(model.contextLimit ? { contextMax: model.contextLimit } : {}),
  };
}

export function catalogModels(catalog: ModelListResult): ModelOption[] {
  const seen = new Set<string>();
  return catalog.models.flatMap((model) => {
    if (model.providerId !== MUSE_PROVIDER || seen.has(model.modelId)) return [];
    seen.add(model.modelId);
    return [modelOption(model)];
  });
}

export async function listMuseModels(launch: ProviderLaunch = {}): Promise<ModelOption[]> {
  const host = await MuseHost.start({
    launch,
    cwd: tmpdir(),
    access: "readOnly",
    sessionLog: false,
    startupTimeoutMs: CATALOG_TIMEOUT_MS,
  });
  try {
    const models = catalogModels(await host.request<ModelListResult>("model/list"));
    if (!models.length)
      throw new Error(
        "Muse Code lists no models for this account. Check that your Meta account has a Muse Code subscription, then refresh.",
      );
    return models;
  } finally {
    await host.close();
  }
}
