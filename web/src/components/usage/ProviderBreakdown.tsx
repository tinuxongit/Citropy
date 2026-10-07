import type { CSSProperties } from "react";
import { cost, providerLabels, tokens } from "../../lib/format.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { formatMeasure, measureOf, type UsageMeasure } from "./usage-series.ts";
import { uncachedInput, type UsageTotals } from "../../../../shared/usage-metrics.ts";
import type { ProviderId } from "../../../../shared/protocol.ts";

const TOP_MODELS = 3;

export function ProviderBreakdown({ providers, totals, models, measure, measureLabel, isolated, onIsolate }: {
  providers: ProviderId[];
  totals: Partial<Record<ProviderId, UsageTotals>>;
  models: (provider: ProviderId) => Array<{ model: string; totals: UsageTotals }>;
  measure: UsageMeasure;
  measureLabel: string;
  isolated: ProviderId | undefined;
  onIsolate: (provider: ProviderId) => void;
}) {
  const grand = providers.reduce((sum, provider) => sum + (totals[provider] ? measureOf(measure, provider, totals[provider]) : 0), 0);
  return (
    <div className="usage-provider-grid">
      {providers.map((provider) => {
        const value = totals[provider];
        const all = value ? measureOf(measure, provider, value) : 0;
        const share = grand ? Math.round((all / grand) * 100) : 0;
        const top = models(provider)
          .map((entry) => ({ ...entry, amount: measureOf(measure, provider, entry.totals) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, TOP_MODELS);
        return (
          <button
            key={provider}
            type="button"
            className="usage-provider-card"
            data-series={provider}
            aria-pressed={isolated === provider}
            title={isolated === provider ? "Show all providers" : `Show only ${providerLabels[provider]}`}
            onClick={() => onIsolate(provider)}
          >
            <span className="usage-provider-name">
              <ProviderIcon provider={provider} />
              <span className="truncate">{providerLabels[provider]}</span>
              <small>{share}% of {measureLabel.toLowerCase()}</small>
            </span>
            <strong className="usage-provider-total">{formatMeasure(measure, all)}</strong>
            <i className="usage-share" style={{ "--share": `${share}%` } as CSSProperties} />
            <span className="usage-provider-stats">
              {[
                ["Input", tokens(value ? uncachedInput(provider, value) : 0)],
                ["Output", tokens(value?.output ?? 0)],
                ["Cache read", tokens(value?.cacheRead ?? 0)],
                ["Cache write", tokens(value?.cacheWrite ?? 0)],
                ["API cost", value?.costUsd ? cost(value.costUsd) : "Unknown"],
                ["Responses", String(value?.turns ?? 0)],
              ].map(([label, amount]) => (
                <span key={label}><span>{label}</span><span>{amount}</span></span>
              ))}
            </span>
            {top.length > 0 && (
              <span className="usage-models">
                {top.map((entry) => (
                  <span key={entry.model}>
                    <span className="truncate">{entry.model || "Model not reported"}</span>
                    <span>{formatMeasure(measure, entry.amount)}</span>
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
