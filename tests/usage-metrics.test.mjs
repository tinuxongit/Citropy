import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeUsage } from "../shared/usage-metrics.ts";

const totals = (input, output, costUsd = 0, turns = 1) => ({ input, output, cacheRead: 0, cacheWrite: 0, costUsd, turns });

test("token totals never go down when a provider reports a smaller session", () => {
  const next = mergeUsage({
    previous: { ...totals(5000, 800, 1.2, 4), contextTokens: 0, contextMax: 0 },
    incoming: totals(300, 20, 0.1, 1),
  });
  assert.deepEqual([next.input, next.output, next.costUsd, next.turns], [5000, 800, 1.2, 4]);
});
