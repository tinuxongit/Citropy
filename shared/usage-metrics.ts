import type { Message, ProviderId, Usage } from "./protocol.ts";

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.max(1, Math.round(chars / 4));
}

function estimateTurnOutput(messages: Message[], runStartedAt: number): number {
  let chars = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || message.ts + 2_000 < runStartedAt) continue;
    for (const part of message.parts) {
      if (part.kind === "text") chars += part.text.length;
    }
  }
  return estimateTokensFromChars(chars);
}

export function uncachedInput(
  provider: ProviderId,
  usage: Pick<Usage, "input" | "cacheRead" | "cacheWrite">,
): number {
  return provider === "codex"
    ? Math.max(0, usage.input - usage.cacheRead - usage.cacheWrite)
    : usage.input;
}

export function newInputTokens(
  provider: ProviderId,
  usage: Pick<Usage, "input" | "cacheRead" | "cacheWrite">,
): number {
  return uncachedInput(provider, usage) + usage.cacheWrite;
}

function tokensPerSecond(tokens: number, elapsedMs: number): number {
  if (!(tokens > 0) || !(elapsedMs >= 250)) return 0;
  return tokens / (elapsedMs / 1000);
}

export function reportedContext(tokens: number, contextMax = 0): boolean {
  return tokens > 0 && (!contextMax || tokens <= contextMax);
}

export const USAGE_TOTAL_KEYS = ["input", "output", "cacheRead", "cacheWrite", "costUsd", "turns"] as const;

export type UsageTotals = Pick<Usage, (typeof USAGE_TOTAL_KEYS)[number]>;

export const emptyUsageTotals = (): UsageTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0 });

export function promptTokens(provider: ProviderId, usage: Pick<Usage, "input" | "cacheRead" | "cacheWrite">): number {
  return usage.input + (provider === "codex" ? 0 : usage.cacheRead + usage.cacheWrite);
}

export function localDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function mergeUsage(options: {
  previous: Usage;
  incoming?: Partial<Usage>;
  messages?: Message[];
  contextMax?: number;
  runStartedAt?: number;
  outputAtStart?: number;
  now?: number;
}): Usage {
  const incoming = options.incoming ?? {};
  const contextMax = incoming.contextMax || options.previous.contextMax || options.contextMax || 0;
  const next: Usage = {
    ...options.previous,
    ...incoming,
    contextMax,
  };
  for (const key of USAGE_TOTAL_KEYS) next[key] = Math.max(options.previous[key] ?? 0, next[key] ?? 0);
  const incomingReported = incoming.contextTokens !== undefined && reportedContext(incoming.contextTokens, contextMax);
  if (!incomingReported && reportedContext(options.previous.contextTokens, contextMax)) next.contextTokens = options.previous.contextTokens;

  const generated = Math.max(0, next.output - (options.outputAtStart ?? 0));
  const estimatedOutput = generated || (
    options.messages && options.runStartedAt
      ? estimateTurnOutput(options.messages, options.runStartedAt)
      : 0
  );
  const rate = tokensPerSecond(estimatedOutput, options.runStartedAt ? (options.now ?? Date.now()) - options.runStartedAt : 0);
  if (rate > 0) next.tokensPerSecond = rate;
  else if (incoming.tokensPerSecond == null && options.previous.tokensPerSecond != null)
    next.tokensPerSecond = options.previous.tokensPerSecond;
  return next;
}
