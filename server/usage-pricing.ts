import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataRoot } from "./paths.ts";
import { saveJson } from "./save-json.ts";
import { uncachedInput } from "../shared/usage-metrics.ts";
import type { CostByType, UsagePricing, UsageSpeed } from "../shared/features.ts";
import type { ProviderId, Usage } from "../shared/protocol.ts";

const PRICES_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_VERSION = 2;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const UNPRICED_MODELS = new Set(["<synthetic>", "opus", "sonnet", "haiku", "fable"]);
const PROVIDERS_REPORTING_COST = new Set<ProviderId>(["opencode"]);

const cacheFile = join(dataRoot, "model-prices.json");

interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

type ModelRate = Rates & Partial<Record<UsageSpeed, Rates>>;

interface PriceCache {
  version: number;
  fetchedAt: number;
  models: Record<string, ModelRate>;
}

export interface PriceTable {
  models: Map<string, ModelRate>;
  pricing: UsagePricing;
}

let current: PriceTable | undefined;
let loading: Promise<PriceTable> | undefined;

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ratesOf(entry: Record<string, unknown>, suffix: string, standard?: Rates): Rates | undefined {
  const input = finite(entry[`input_cost_per_token${suffix}`]);
  const output = finite(entry[`output_cost_per_token${suffix}`]);
  if (input === undefined || output === undefined) return;
  const cache = (name: string, field: "cacheRead" | "cacheWrite") =>
    finite(entry[`${name}${suffix}`]) ?? (standard?.input ? standard[field] / standard.input * input : input);
  return { input, output, cacheRead: cache("cache_read_input_token_cost", "cacheRead"), cacheWrite: cache("cache_creation_input_token_cost", "cacheWrite") };
}

function scaled(rates: Rates, multiple: number): Rates {
  return { input: rates.input * multiple, output: rates.output * multiple, cacheRead: rates.cacheRead * multiple, cacheWrite: rates.cacheWrite * multiple };
}

function sameRate(a: ModelRate, b: ModelRate): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parsePrices(document: Record<string, unknown>): Record<string, ModelRate> {
  const models: Record<string, ModelRate> = {};
  for (const [name, raw] of Object.entries(document)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const standard = ratesOf(entry, "");
    if (!standard) continue;
    const multiple = finite((entry.provider_specific_entry as Record<string, unknown> | undefined)?.fast);
    const fast = multiple ? scaled(standard, multiple) : ratesOf(entry, "_priority", standard);
    const ultrafast = ratesOf(entry, "_ultrafast", standard);
    models[name.trim().toLowerCase()] = { ...standard, ...(fast ? { fast } : {}), ...(ultrafast ? { ultrafast } : {}) };
  }
  const aliases = new Map<string, ModelRate | null>();
  for (const [key, rate] of Object.entries(models)) {
    const bare = key.slice(key.lastIndexOf("/") + 1);
    if (bare === key || models[bare]) continue;
    const held = aliases.get(bare);
    aliases.set(bare, held === undefined ? rate : held && sameRate(held, rate) ? held : null);
  }
  for (const [bare, rate] of aliases) if (rate) models[bare] = rate;
  return models;
}

function tableOf(saved: PriceCache, error?: string): PriceTable {
  return { models: new Map(Object.entries(saved.models)), pricing: { fetchedAt: saved.fetchedAt, ...(error ? { error } : {}) } };
}

async function download(): Promise<PriceCache> {
  const response = await fetch(PRICES_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Model prices could not be downloaded (HTTP ${response.status}).`);
  const saved = { version: CACHE_VERSION, fetchedAt: Date.now(), models: parsePrices(await response.json() as Record<string, unknown>) };
  saveJson(cacheFile, saved);
  return saved;
}

export function priceTable(): Promise<PriceTable> {
  if (current && Date.now() - current.pricing.fetchedAt! < MAX_AGE_MS) return Promise.resolve(current);
  loading ??= (async () => {
    const stored = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) as PriceCache : undefined;
    if (!current && stored?.version === CACHE_VERSION && Date.now() - stored.fetchedAt < MAX_AGE_MS) return current = tableOf(stored);
    const saved = current ?? (stored && tableOf(stored));
    try {
      return current = tableOf(await download());
    } catch (error) {
      const message = (error as Error).message;
      return current = saved
        ? { models: saved.models, pricing: { fetchedAt: saved.pricing.fetchedAt, error: message } }
        : { models: new Map(), pricing: { error: message } };
    }
  })().finally(() => { loading = undefined; });
  return loading;
}

function rateFor(table: PriceTable, model: string | undefined): ModelRate | undefined {
  if (!model) return;
  const key = model.trim().toLowerCase().replace(/\[.*$/, "");
  if (UNPRICED_MODELS.has(key.slice(key.lastIndexOf("/") + 1))) return;
  return table.models.get(key) ?? table.models.get(key.slice(key.lastIndexOf("/") + 1));
}

export function isUnpriced(table: PriceTable, provider: ProviderId, model: string | undefined): boolean {
  return !rateFor(table, model) && !PROVIDERS_REPORTING_COST.has(provider);
}

type PricedUsage = Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite" | "costUsd">;

export function costByType(
  table: PriceTable,
  provider: ProviderId,
  model: string | undefined,
  usage: PricedUsage,
  speed?: UsageSpeed,
): CostByType | undefined {
  const rate = rateFor(table, model);
  if (!rate) return;
  const rates = (speed && rate[speed]) ?? rate;
  return {
    input: uncachedInput(provider, usage) * rates.input,
    cacheRead: usage.cacheRead * rates.cacheRead,
    cacheWrite: usage.cacheWrite * rates.cacheWrite,
    output: usage.output * rates.output,
  };
}

export function costOf(
  table: PriceTable,
  provider: ProviderId,
  model: string | undefined,
  usage: PricedUsage,
  speed?: UsageSpeed,
): number {
  const parts = costByType(table, provider, model, usage, speed);
  return parts ? parts.input + parts.cacheRead + parts.cacheWrite + parts.output : usage.costUsd;
}
