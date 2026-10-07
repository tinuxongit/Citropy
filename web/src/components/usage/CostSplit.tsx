import type { CSSProperties } from "react";
import { cost } from "../../lib/format.ts";
import type { CostSplit as Split } from "./usage-series.ts";

const MIN_SHOWN_USD = 0.005;

const TYPE_SEGMENTS: Array<{ key: keyof Split["byType"]; label: string; ink: number }> = [
  { key: "input", label: "Input", ink: 60 },
  { key: "cacheRead", label: "Cache read", ink: 30 },
  { key: "cacheWrite", label: "Cache write", ink: 76 },
  { key: "output", label: "Output", ink: 100 },
  { key: "other", label: "Other", ink: 44 },
];

const SPEED_SEGMENTS: Array<{ key: keyof Split["bySpeed"]; label: string; ink: number }> = [
  { key: "standard", label: "Standard", ink: 34 },
  { key: "fast", label: "Fast", ink: 66 },
  { key: "ultrafast", label: "Ultrafast", ink: 100 },
];

function ShareBar({ label, segments }: { label: string; segments: Array<{ label: string; ink: number; value: number }> }) {
  const shown = segments.filter((segment) => segment.value >= MIN_SHOWN_USD);
  const total = shown.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;
  const percent = (value: number) => `${Math.round((value / total) * 100)}%`;
  return (
    <div className="usage-share-bar">
      <h3>{label}</h3>
      <div className="usage-share-track" role="img" aria-label={`${label}: ${shown.map((segment) => `${segment.label} ${cost(segment.value)}`).join(", ")}`}>
        {shown.map((segment) => (
          <i
            key={segment.label}
            title={`${segment.label} ${cost(segment.value)}, ${percent(segment.value)}`}
            style={{ flexGrow: segment.value, "--ink": `${segment.ink}%` } as CSSProperties}
          />
        ))}
      </div>
      <ul className="usage-share-legend">
        {shown.map((segment) => (
          <li key={segment.label}>
            <i style={{ "--ink": `${segment.ink}%` } as CSSProperties} />
            <span>{segment.label}</span>
            <strong>{cost(segment.value)}</strong>
            <small>{percent(segment.value)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CostSplit({ split }: { split: Split }) {
  const speeds = SPEED_SEGMENTS.map((segment) => ({ ...segment, value: split.bySpeed[segment.key] }));
  return (
    <div className="usage-cost-split">
      <ShareBar label="Cost by token type" segments={TYPE_SEGMENTS.map((segment) => ({ ...segment, value: split.byType[segment.key] }))} />
      {speeds.some((segment) => segment.key !== "standard" && segment.value >= MIN_SHOWN_USD) && <ShareBar label="Cost by speed" segments={speeds} />}
    </div>
  );
}
