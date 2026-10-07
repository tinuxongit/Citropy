import { invocation, resolveCommand } from "./binary.ts";
import { providerControl } from "./control.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderLaunch } from "./types.ts";
import type { ModelOption } from "../../shared/protocol.ts";

const run = promisify(execFile);

interface CodexModel {
  model: string;
  displayName: string;
  description?: string;
  hidden?: boolean;
  isDefault?: boolean;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string }>;
  defaultReasoningEffort?: string;
  serviceTiers?: Array<{ id: string; description?: string }>;
  additionalSpeedTiers?: string[];
  contextWindow?: number;
}

interface ClaudeModel {
  value: string;
  displayName: string;
  description?: string;
  resolvedModel?: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  defaultEffort?: string;
  supportsFastMode?: boolean;
  contextWindow?: number;
}

function codexModels(data: CodexModel[]): ModelOption[] {
  return data
    .filter((model) => !model.hidden)
    .map((model) => ({
      id: model.model,
      label: model.displayName,
      hint: model.description,
      efforts:
        model.supportedReasoningEfforts?.map(
          (option) => option.reasoningEffort,
        ) ?? [],
      defaultEffort: model.defaultReasoningEffort,
      isDefault: model.isDefault,
      contextMax: model.contextWindow,
      fastMode:
        model.serviceTiers?.some((tier) => tier.id === "priority") ||
        model.additionalSpeedTiers?.includes("fast") ||
        false,
      fastModeHint: model.serviceTiers?.find((tier) => tier.id === "priority")
        ?.description,
      fastModeTier: model.serviceTiers?.some((tier) => tier.id === "priority")
        ? "priority"
        : model.additionalSpeedTiers?.includes("fast") ? "fast" : undefined,
    }));
}

interface ClaudeCommand {
  name: string;
  argumentHint?: string;
}

function claudeEfforts(model: ClaudeModel): string[] {
  return model.supportsEffort ? (model.supportedEffortLevels ?? []) : [];
}

function claudeSessionOnlyEfforts(data: ClaudeModel[], commands: ClaudeCommand[]): { base: string[]; extra: string[] } {
  const sessionModel = data.find((model) => model.value === "default");
  const base = sessionModel ? claudeEfforts(sessionModel) : [];
  const hint = commands.find((command) => command.name === "effort")?.argumentHint ?? "";
  const offered = hint.replace(/^[<[]|[>\]]$/g, "").replace(/\s*\[[^\]]*\]/g, "").split("|").filter((level) => /^[a-z]+$/.test(level) && level !== "auto");
  return { base, extra: base.length ? offered.filter((level) => !base.includes(level)) : [] };
}

function claudeModels(data: ClaudeModel[], commands: ClaudeCommand[] = []): ModelOption[] {
  const sessionOnly = claudeSessionOnlyEfforts(data, commands);
  const models = new Map<string, ModelOption>();
  for (const model of data) {
    const resolved = model.resolvedModel ?? model.value;
    if (resolved === "default") continue;
    const id = resolved.replace(/\[1m\]$/i, "");
    const previous = models.get(id);
    const named =
      /^claude-(opus|fable|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id);
    const label = named
      ? `Claude ${named[1]![0]!.toUpperCase()}${named[1]!.slice(1)} ${named[2]}${named[3] ? `.${named[3]}` : ""}`
      : model.displayName.replace(/^Default.*$/i, id);
    const extended =
      /\[1m\]/i.test(`${resolved} ${model.value}`) ||
      /claude-(?:fable-[5-9]|sonnet-[5-9]|opus-[5-9])/.test(id);
    const efforts = claudeEfforts(model);
    const offersSessionOnly = sessionOnly.base.every((level) => efforts.includes(level));
    const contextMax =
      model.contextWindow ??
      (extended ? 1_000_000 : named ? 200_000 : undefined);
    models.set(id, {
      id,
      label,
      hint: model.description,
      resolvedModel: id,
      aliases: [
        ...new Set([...(previous?.aliases ?? []), model.value, resolved]),
      ],
      efforts: offersSessionOnly ? [...efforts, ...sessionOnly.extra] : efforts,
      defaultEffort: model.defaultEffort,
      isDefault: previous?.isDefault || model.value === "default",
      contextMax:
        Math.max(previous?.contextMax ?? 0, contextMax ?? 0) || undefined,
      contextWindows:
        extended || previous?.contextWindows?.length === 2
          ? [200_000, 1_000_000]
          : contextMax
            ? [contextMax]
            : undefined,
      fastMode: previous?.fastMode || model.supportsFastMode || false,
      fastModeHint: model.supportsFastMode
        ? "Faster responses using paid usage credits"
        : previous?.fastModeHint,
    });
  }
  return [...models.values()];
}

export async function discoverModels(provider: "codex" | "claude", launch?: ProviderLaunch): Promise<ModelOption[]> {
  if (provider === "claude") {
    const init = await providerControl("claude", "initialize", {}, undefined, launch);
    if (!init.models) throw new Error("Claude returned no models");
    return claudeModels(init.models, init.commands);
  }
  const models: ModelOption[] = [];
  for (let cursor: string | undefined, seen = new Set<string>(); ;) {
    const result = await providerControl("codex", "model/list", cursor ? { cursor } : {}, undefined, launch);
    if (!result.data) throw new Error("Codex returned no models");
    models.push(...codexModels(result.data));
    if (!result.nextCursor) return models;
    if (seen.has(result.nextCursor)) throw new Error("Codex returned a repeated model cursor");
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
}

function openCodeModels(output: string): ModelOption[] {
  const models: ModelOption[] = [];
  for (const match of output.matchAll(/^([^\s]+\/[^\s]+)\r?\n(\{[\s\S]*?^\})/gm)) {
    const model = JSON.parse(match[2]!);
    models.push({ id: match[1]!, label: model.name ?? model.id, hint: model.providerID, contextMax: model.limit?.context, efforts: Object.keys(model.variants ?? {}) });
  }
  if (!models.length) throw new Error("OpenCode returned no model metadata");
  return models;
}

export async function discoverOpenCodeModels(launch?: ProviderLaunch): Promise<ModelOption[]> {
  const call = invocation(resolveCommand(launch?.binary ?? "opencode"), ["models", "--verbose", "--refresh"]);
  const { stdout } = await run(call.file, call.args, { timeout: 20_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...launch?.environment }, windowsVerbatimArguments: call.verbatim });
  return openCodeModels(stdout);
}
