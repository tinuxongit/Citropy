import * as acp from "@agentclientprotocol/sdk";
import { tmpdir } from "node:os";
import { closeAgent, initializeAgent, signedOut, spawnAgent, withTimeout, type AcpConfig } from "./acp-connection.ts";
import type { ModelOption } from "../../shared/protocol.ts";

type SelectOption = Extract<acp.SessionConfigOption, { type: "select" }>;
type ConfigOptions = acp.SessionConfigOption[] | null | undefined;

const EFFORT_VALUES = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "extra-high", "extra_high", "max"]);

export function contextTokens(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/i.exec(value.trim());
  if (!match) return undefined;
  const unit = match[2]?.toLowerCase();
  return Number(match[1]) * (unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1);
}

export function contextMax(id: string): number | undefined {
  const match = /context=(\d+(?:\.\d+)?[km]?)/i.exec(id);
  return match ? contextTokens(match[1]!) : undefined;
}

function modelHint(id: string): string | undefined {
  const match = /\[([^\]]*)\]/.exec(id);
  if (!match) return undefined;
  const params: Record<string, string> = {};
  for (const part of match[1]!.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) params[key.trim()] = value.trim();
  }
  const parts: string[] = [];
  if (params.context) parts.push(`${params.context} context`);
  const effort = params.effort ?? params.reasoning ?? params.reasoning_effort;
  if (effort) parts.push(`${effort} effort`);
  if (params.fast === "true") parts.push("fast");
  if (params.thinking === "true" && !effort) parts.push("thinking");
  return parts.length ? parts.join(" · ") : undefined;
}

export function selectOption(options: ConfigOptions, category: string, predicate?: (option: SelectOption) => boolean): SelectOption | undefined {
  return (options ?? []).find(
    (entry): entry is SelectOption =>
      entry.type === "select" && entry.category === category && (!predicate || predicate(entry)),
  );
}

export function optionValues(option: SelectOption): string[] {
  const values: string[] = [];
  for (const entry of option.options ?? []) {
    if ("value" in entry) values.push(entry.value);
    else for (const nested of entry.options) values.push(nested.value);
  }
  return values;
}

function displayName(value: string): string {
  return value.replace(/[​-‍﻿]/g, "");
}

export function effortOption(options: ConfigOptions): SelectOption | undefined {
  return selectOption(options, "thought_level", (option) => optionValues(option).some((value) => EFFORT_VALUES.has(value)));
}

export function contextOption(options: ConfigOptions): SelectOption | undefined {
  return selectOption(options, "model_config", (option) => {
    const values = optionValues(option);
    return values.length > 0 && values.every((value) => contextTokens(value) !== undefined);
  });
}

export function fastOption(options: ConfigOptions): SelectOption | undefined {
  return selectOption(options, "model_config", (option) =>
    /fast/i.test(`${option.id} ${option.name}`) && optionValues(option).includes("true"),
  );
}

function modelSelect(response: acp.NewSessionResponse): SelectOption | undefined {
  return selectOption(response.configOptions, "model");
}

function legacyModels(response: acp.NewSessionResponse): { currentModelId?: string; availableModels?: Array<{ modelId: string; name: string }> } | undefined {
  return (response as acp.NewSessionResponse & { models?: { currentModelId?: string; availableModels?: Array<{ modelId: string; name: string }> } }).models;
}

export function acpCurrentModel(response: acp.NewSessionResponse): string | undefined {
  return modelSelect(response)?.currentValue ?? legacyModels(response)?.currentModelId;
}

function modelLabels(option: SelectOption | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  for (const entry of option?.options ?? []) {
    if ("value" in entry) labels.set(entry.value, displayName(entry.name));
    else for (const nested of entry.options) labels.set(nested.value, displayName(nested.name));
  }
  return labels;
}

function describeModel(id: string, label: string | undefined, options: ConfigOptions): ModelOption {
  const effort = effortOption(options);
  const context = contextOption(options);
  const fast = fastOption(options);
  const windows = context ? optionValues(context).map(contextTokens).filter((value): value is number => value !== undefined) : [];
  return {
    id,
    label: displayName(label ?? id),
    hint: modelHint(id),
    isDefault: id.startsWith("default"),
    efforts: effort ? optionValues(effort) : [],
    defaultEffort: effort?.currentValue ?? undefined,
    contextWindows: windows.length > 1 ? windows : undefined,
    contextMax: context ? contextTokens(context.currentValue) : contextMax(id),
    fastMode: Boolean(fast),
    fastModeHint: fast ? "Cursor runs this model faster with increased usage" : undefined,
  };
}

function acpModelOptions(response: acp.NewSessionResponse): ModelOption[] {
  const select = modelSelect(response);
  const values: Array<{ id: string; label: string }> = [];
  if (select) {
    const labels = modelLabels(select);
    for (const value of optionValues(select)) values.push({ id: value, label: labels.get(value) ?? value });
  } else {
    for (const model of legacyModels(response)?.availableModels ?? [])
      values.push({ id: model.modelId, label: displayName(model.name) });
  }
  return values.map(({ id, label }) => describeModel(id, label, undefined));
}

export async function acpModels(config: AcpConfig, launch?: import("./types.ts").ProviderLaunch): Promise<ModelOption[]> {
  const { child, stream } = spawnAgent(config, tmpdir(), launch);
  const connection = acp.client({ name: "citropy" }).connect(stream);
  try {
    await initializeAgent(connection.agent, config);
    if (config.modelListing) {
      const listing = await withTimeout(
        connection.agent.request(config.modelListing, {}) as Promise<{ models?: Array<{ value?: unknown; name?: unknown; configOptions?: acp.SessionConfigOption[] | null }> }>,
        20_000,
        `${config.label} did not list models within 20 seconds`,
      ).catch((error: unknown) => { throw signedOut(config, error); });
      return (listing.models ?? []).flatMap((entry) =>
        typeof entry.value === "string" && typeof entry.name === "string"
          ? [describeModel(entry.value, entry.name, entry.configOptions)]
          : []);
    }
    const response = await withTimeout(
      connection.agent.request(acp.methods.agent.session.new, { cwd: tmpdir(), mcpServers: [] }),
      60_000,
      `${config.label} did not return models within 60 seconds`,
    ).catch((error: unknown) => { throw signedOut(config, error); });
    const select = modelSelect(response);
    if (!select) return acpModelOptions(response);
    const labels = modelLabels(select);
    const initial = select.currentValue;
    const models: ModelOption[] = [];
    for (const value of optionValues(select)) {
      if (!value.startsWith("default") && value !== initial) {
        try {
          const result = await withTimeout(
            connection.agent.request(acp.methods.agent.session.setConfigOption, { sessionId: response.sessionId, configId: select.id, value }),
            10_000,
            `${config.label} did not describe ${value} within 10 seconds`,
          );
          models.push(describeModel(value, labels.get(value), result.configOptions));
          continue;
        } catch {
          // Fall through to the undiscovered description.
        }
      }
      models.push(describeModel(value, labels.get(value), value === initial ? response.configOptions : undefined));
    }
    if (initial) {
      await withTimeout(
        connection.agent.request(acp.methods.agent.session.setConfigOption, { sessionId: response.sessionId, configId: select.id, value: initial }),
        10_000,
        `${config.label} did not restore ${initial} within 10 seconds`,
      ).catch(() => undefined);
    }
    return models;
  } finally {
    closeAgent(connection, child);
  }
}
