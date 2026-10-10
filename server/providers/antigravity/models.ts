import { readFile, rename, writeFile } from "node:fs/promises";
import type { SessionConfigOption, SessionConfigSelectOption } from "@agentclientprotocol/sdk";
import { ifMissing } from "../../../shared/expected-errors.mjs";
import { effectiveEffort, selectedModel } from "../../../shared/model-options.ts";
import type { ModelOption } from "../../../shared/protocol.ts";
import type { ProviderLaunch } from "../types.ts";
import { antigravityProfile, type AntigravityProfile } from "./profile.ts";

const MODEL_OPTION = "model";
const EFFORT_SUFFIX = /^(.+) \(([^()]+)\)$/;

export function modelSelector(configOptions: SessionConfigOption[] | null | undefined): Extract<SessionConfigOption, { type: "select" }> | undefined {
  const option = configOptions?.find(entry => entry.id === MODEL_OPTION);
  return option?.type === "select" ? option : undefined;
}

export function selectChoices(option: Extract<SessionConfigOption, { type: "select" }>): SessionConfigSelectOption[] {
  return option.options.flatMap(entry => "group" in entry ? entry.options : [entry]);
}

function requireSelector(configOptions: SessionConfigOption[] | null | undefined): Extract<SessionConfigOption, { type: "select" }> {
  const selector = modelSelector(configOptions);
  if (!selector) throw new Error("Antigravity did not report its models.");
  return selector;
}

interface ModelChoice {
  value: string;
  model: string;
  label: string;
  effort?: string;
  hint?: string;
}

function modelChoices(selector: Extract<SessionConfigOption, { type: "select" }>): ModelChoice[] {
  const parsed = selectChoices(selector).map(choice => ({ choice, match: EFFORT_SUFFIX.exec(choice.name) }));
  const levels = new Map<string, number>();
  for (const { match } of parsed) if (match) levels.set(match[1]!, (levels.get(match[1]!) ?? 0) + 1);
  return parsed.map(({ choice, match }) => match && levels.get(match[1]!)! > 1
    ? { value: choice.value, model: match[1]!.toLowerCase().replaceAll(" ", "-"), label: match[1]!, effort: match[2]!.toLowerCase() }
    : { value: choice.value, model: choice.value, label: choice.name, ...(choice.description ? { hint: choice.description } : {}) });
}

export function modelOptions(configOptions: SessionConfigOption[] | null | undefined): ModelOption[] {
  const selector = requireSelector(configOptions);
  const options = new Map<string, ModelOption>();
  for (const choice of modelChoices(selector)) {
    const option = options.get(choice.model) ?? { id: choice.model, label: choice.label, ...(choice.hint ? { hint: choice.hint } : {}) };
    options.set(choice.model, option);
    if (choice.effort) {
      option.efforts = [...option.efforts ?? [], choice.effort];
      option.aliases = [...option.aliases ?? [], choice.value];
    }
    if (choice.value !== selector.currentValue) continue;
    option.isDefault = true;
    if (choice.effort) option.defaultEffort = choice.effort;
  }
  // Why: Antigravity lists efforts strongest first, and Citropy's effort slider fills from the weakest.
  for (const option of options.values()) option.efforts?.reverse();
  return [...options.values()];
}

export function agentModel(configOptions: SessionConfigOption[] | null | undefined, model: string, effort: string | undefined): string {
  const selector = requireSelector(configOptions);
  const option = selectedModel(modelOptions(configOptions), model);
  if (!option) throw new Error(`Antigravity does not offer the model ${model}.`);
  const level = effectiveEffort(option, effort);
  const choice = modelChoices(selector).find(entry => entry.model === option.id && entry.effort === level);
  if (!choice) throw new Error(`Antigravity does not offer ${option.label} at ${level} effort.`);
  return choice.value;
}

export function currentModel(configOptions: SessionConfigOption[] | null | undefined): { model: string; effort?: string } {
  const selector = requireSelector(configOptions);
  const choice = modelChoices(selector).find(entry => entry.value === selector.currentValue);
  if (!choice) throw new Error(`Antigravity reported an unknown current model ${selector.currentValue}.`);
  return { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) };
}

export async function accountModels(launch: ProviderLaunch = {}): Promise<ModelOption[]> {
  const raw = await readFile(antigravityProfile(launch.instanceId).modelsPath, "utf8").catch(ifMissing(undefined));
  if (raw === undefined) throw new Error("Sign in to Antigravity to load its models.");
  return JSON.parse(raw) as ModelOption[];
}

export async function saveModels(profile: AntigravityProfile, models: ModelOption[]): Promise<void> {
  const partial = `${profile.modelsPath}.partial`;
  await writeFile(partial, `${JSON.stringify(models, null, 2)}\n`, { mode: 0o600 });
  await rename(partial, profile.modelsPath);
}
