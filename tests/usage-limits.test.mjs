import assert from "node:assert/strict";
import { test } from "node:test";
import { isUsageLimitError, limitAfterError, resetTimeFromMessage } from "../server/usage-limits.ts";

const now = new Date(2026, 8, 26, 10, 0, 0).getTime();

test("usage limit errors are recognised without catching ordinary failures", () => {
  for (const message of [
    "Claude AI usage limit reached|1790000000",
    "You've hit your limit · resets 3pm (Europe/Madrid)",
    "You've hit your usage limit. Upgrade to Pro or try again in 2 hours 30 minutes.",
    "5-hour limit reached ∙ resets 7pm",
    "429 Too Many Requests",
  ]) assert.equal(isUsageLimitError(message), true, message);
  for (const message of ["The command failed with exit code 1", "Permission denied", "", undefined])
    assert.equal(isUsageLimitError(message), false, String(message));
});

test("reset times come from epochs, durations and clock times", () => {
  assert.equal(resetTimeFromMessage("Claude AI usage limit reached|1790000000", now), 1_790_000_000_000);
  assert.equal(resetTimeFromMessage("Try again in 2 hours 30 minutes.", now), now + 2.5 * 3_600_000);
  assert.equal(resetTimeFromMessage("try again in 1 day, 3h and 5m", now), now + 86_400_000 + 3 * 3_600_000 + 5 * 60_000);
  assert.equal(resetTimeFromMessage("You've hit your limit · resets 3pm", now), new Date(2026, 8, 26, 15, 0, 0).getTime());
  assert.equal(resetTimeFromMessage("Limit reached. Resets at 9:30 am", now), new Date(2026, 8, 27, 9, 30, 0).getTime());
  assert.equal(resetTimeFromMessage("Usage limit reached", now), undefined);
});

test("only limit errors produce a waiting state, carrying the resume choice", () => {
  assert.deepEqual(limitAfterError("Try again in 10 minutes. Usage limit reached.", true, now), { at: now, resetsAt: now + 600_000, resume: true });
  assert.deepEqual(limitAfterError("Usage limit reached", false, now), { at: now, resetsAt: undefined, resume: false });
  assert.equal(limitAfterError("Network error", true, now), undefined);
  assert.equal(limitAfterError(undefined, true, now), undefined);
});
