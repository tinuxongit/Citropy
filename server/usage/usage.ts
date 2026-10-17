import { store } from "../store.ts";
import { emptyUsage } from "../../shared/protocol.ts";
import { providerControl } from "../providers/control.ts";
import { USAGE_TOTAL_KEYS, promptTokens } from "../../shared/usage-metrics.ts";
import { providerLogUsage } from "./provider-log-usage.ts";
import { resolveProviderAccount } from "../providers/provider-account.ts";
import { readMuseUsage } from "../providers/muse/limits.ts";
import type { SubscriptionUsage } from "@muse-code/sdk/dist/src/msp.js";
import { costByType, costOf, isUnpriced, priceTable } from "./usage-pricing.ts";
import type { ProviderId } from "../../shared/protocol.ts";
import type { ProviderUsage, UsageDay, UsageReport, UsageWindow } from "../../shared/features.ts";

const cached = new Map<string, ProviderUsage>();
const pending = new Map<string, Promise<ProviderUsage>>();

const WEEK_MINUTES = 7 * 24 * 60;
const MONTH_MINUTES = 30 * 24 * 60;
const SESSION_MINUTES = 5 * 60;
const MONTHLY_PLANS = new Set(["free", "go"]);
const UNREPORTED_LIMITS = {
  opencode:
    "OpenCode does not expose a combined remaining allowance. Check the connected model service.",
  antigravity: "Citropy cannot read Antigravity's remaining allowance yet.",
};
const CLAUDE_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5 hours",
  seven_day: "Weekly",
  session: "5 hours",
  weekly_all: "Weekly",
  weekly_scoped: "Weekly",
};
const CLAUDE_WINDOW_MINUTES: Record<string, number> = {
  five_hour: SESSION_MINUTES,
  seven_day: WEEK_MINUTES,
  session: SESSION_MINUTES,
  weekly_all: WEEK_MINUTES,
  weekly_scoped: WEEK_MINUTES,
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function durationLabel(minutes: number): string {
  if (minutes >= MONTH_MINUTES) return "Monthly";
  if (minutes >= WEEK_MINUTES) return "Weekly";
  return `${minutes / 60} hours`;
}

function codexWindows(result: Record<string, any>): UsageWindow[] {
  const limits: Array<[string, Record<string, any> | undefined]> = result.rateLimitsByLimitId
    ? Object.entries(result.rateLimitsByLimitId)
    : [["codex", result.rateLimits]];
  return limits.flatMap(([id, bucket]) =>
    ["primary", "secondary"].flatMap((key) => {
      const window = bucket?.[key];
      if (!Number.isFinite(window?.usedPercent)) return [];
      const fallback =
        key === "secondary"
          ? WEEK_MINUTES
          : MONTHLY_PLANS.has(bucket?.planType)
            ? MONTH_MINUTES
            : SESSION_MINUTES;
      const minutes = window.windowDurationMins || fallback;
      const label = durationLabel(minutes);
      const name = bucket?.limitName || (id === "codex" ? "" : id);
      return [
        {
          label: name ? `${name} · ${label}` : label,
          usedPercent: clampPercent(window.usedPercent),
          resetsAt: Number.isFinite(window.resetsAt) ? window.resetsAt * 1000 : undefined,
          minutes,
        },
      ];
    }),
  );
}

function claudeWindows(limits: Record<string, any>): UsageWindow[] {
  if (Array.isArray(limits.limits))
    return limits.limits
      .filter((entry: any) => Number.isFinite(entry?.percent))
      .map((entry: any) => {
        const label = CLAUDE_WINDOW_LABELS[entry.kind] ?? String(entry.kind).replaceAll("_", " ");
        const scope = entry.scope?.model?.display_name ?? entry.scope?.surface?.display_name;
        return {
          label: scope ? `${label} · ${scope}` : label,
          usedPercent: clampPercent(entry.percent),
          resetsAt: Date.parse(entry.resets_at) || undefined,
          minutes: CLAUDE_WINDOW_MINUTES[entry.kind],
        };
      });
  const windows: UsageWindow[] = [];
  for (const key of ["five_hour", "seven_day"]) {
    const window = limits[key];
    if (Number.isFinite(window?.utilization))
      windows.push({
        label: CLAUDE_WINDOW_LABELS[key]!,
        usedPercent: clampPercent(window.utilization),
        resetsAt: Date.parse(window.resets_at) || undefined,
        minutes: CLAUDE_WINDOW_MINUTES[key],
      });
  }
  for (const window of limits.model_scoped ?? [])
    if (Number.isFinite(window.utilization))
      windows.push({
        label: `Weekly · ${window.display_name}`,
        usedPercent: clampPercent(window.utilization),
        resetsAt: Date.parse(window.resets_at) || undefined,
        minutes: WEEK_MINUTES,
      });
  return windows;
}

function museLimits(usage: SubscriptionUsage | undefined): ProviderUsage {
  if (!usage)
    return {
      provider: "muse",
      windows: [],
      updatedAt: Date.now(),
      error:
        "Muse Code reports its allowance after its first reply. Send a message, then check again.",
    };
  return {
    provider: "muse",
    windows: [
      {
        label: durationLabel(usage.window.windowDurationMins),
        usedPercent: clampPercent(usage.window.usedPercent),
        resetsAt: usage.window.resetsAtMs,
        minutes: usage.window.windowDurationMins,
      },
      {
        label: durationLabel(WEEK_MINUTES),
        usedPercent: clampPercent(usage.weekly.usedPercent),
        resetsAt: usage.weekly.resetsAtMs,
        minutes: WEEK_MINUTES,
      },
    ],
    plan: usage.tier,
    updatedAt: usage.observedAtMs,
  };
}

function parseProviderLimits(provider: ProviderId, result: Record<string, any>): ProviderUsage {
  const windows =
    provider === "codex" ? codexWindows(result) : claudeWindows(result.rate_limits ?? result);
  return {
    provider,
    windows,
    updatedAt: Date.now(),
    error: windows.length ? undefined : "This account does not report subscription limits.",
  };
}

export async function providerLimits(
  provider: ProviderId,
  instanceId?: string,
): Promise<ProviderUsage> {
  const { instance, launch } = resolveProviderAccount(provider, instanceId);
  const key = JSON.stringify([provider, instanceId, instance?.binary, instance?.environment]);
  const saved = cached.get(key);
  if (saved && Date.now() - saved.updatedAt < 30_000) return saved;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async (): Promise<ProviderUsage> => {
    try {
      if (provider === "opencode" || provider === "antigravity")
        return { provider, windows: [], updatedAt: Date.now(), error: UNREPORTED_LIMITS[provider] };
      if (provider === "muse") return museLimits(await readMuseUsage(launch));
      return parseProviderLimits(
        provider,
        await providerControl(
          provider,
          provider === "codex" ? "account/rateLimits/read" : "get_usage",
          provider === "codex" ? {} : { skip_behaviors: true },
          undefined,
          launch,
        ),
      );
    } catch (error) {
      return {
        provider,
        windows: saved?.windows ?? [],
        updatedAt: Date.now(),
        error: (error as Error).message,
      };
    }
  })()
    .then((result) => {
      for (const id of cached.keys()) {
        const [savedProvider, savedInstanceId] = JSON.parse(id) as [ProviderId, string | null];
        if (!savedInstanceId) continue;
        const current = store.providerInstances.get(savedInstanceId);
        if (
          !current ||
          current.provider !== savedProvider ||
          id !==
            JSON.stringify([savedProvider, savedInstanceId, current.binary, current.environment])
        )
          cached.delete(id);
      }
      cached.set(key, result);
      return result;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function mergeDays(days: UsageDay[]): UsageDay[] {
  const merged = new Map<string, UsageDay>();
  for (const day of days) {
    const key = `${day.day}\u0000${day.provider}\u0000${day.model ?? ""}\u0000${day.speed ?? ""}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...day });
      continue;
    }
    for (const field of USAGE_TOTAL_KEYS) existing[field] += day[field];
  }
  return [...merged.values()];
}

export async function usageReport(providers: ProviderId[]): Promise<UsageReport> {
  const prices = await priceTable();
  const conversations = [...store.threads.values()]
    .filter((thread) => !thread.nativeAgentId)
    .flatMap((thread) =>
      [
        ...(thread.transfers ?? []),
        {
          provider: thread.provider,
          model: thread.model,
          usage: thread.usage,
          at: thread.updatedAt,
        },
      ].map((session, index) => ({
        id: index === (thread.transfers?.length ?? 0) ? thread.id : `${thread.id}:${index}`,
        title: thread.title,
        projectId: thread.projectId,
        provider: session.provider,
        model: session.model,
        usage: {
          ...session.usage,
          costUsd:
            session.usage.costUsd || costOf(prices, session.provider, session.model, session.usage),
        },
        updatedAt: session.at,
      })),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const totals = emptyUsage();
  for (const thread of conversations) {
    totals.input += promptTokens(thread.provider, thread.usage);
    totals.output += thread.usage.output;
    totals.cacheRead += thread.usage.cacheRead;
    totals.cacheWrite += thread.usage.cacheWrite;
    totals.costUsd += thread.usage.costUsd;
    totals.turns += thread.usage.turns;
  }
  return {
    totals,
    history: mergeDays(await providerLogUsage()).map((day) => {
      const parts = costByType(prices, day.provider, day.model, day, day.speed);
      return {
        ...day,
        costUsd: costOf(prices, day.provider, day.model, day, day.speed),
        ...(parts ? { costByType: parts } : {}),
        ...(isUnpriced(prices, day.provider, day.model) ? { unpriced: true } : {}),
      };
    }),
    pricing: prices.pricing,
    conversations,
    providers: await usageLimits(providers),
  };
}

export function usageLimits(providers: ProviderId[]): Promise<ProviderUsage[]> {
  return Promise.all(providers.map((provider) => providerLimits(provider)));
}
