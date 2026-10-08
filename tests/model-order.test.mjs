import assert from "node:assert/strict";
import { test } from "node:test";
import { byFamily } from "../web/src/lib/model-order.ts";

const labels = (models) => byFamily(models.map((label) => ({ id: label, label }))).map((model) => model.label);

test("models group by family in first-listed order with the newest version first", () => {
  assert.deepEqual(
    labels(["Claude Opus 5.5", "Claude Fable 5.1", "Claude Haiku 5.5", "Claude Haiku 4.5", "Claude Opus 5", "Claude Fable 5", "Claude Opus 4.8"]),
    ["Claude Opus 5.5", "Claude Opus 5", "Claude Opus 4.8", "Claude Fable 5.1", "Claude Fable 5", "Claude Haiku 5.5", "Claude Haiku 4.5"],
  );
});

test("versions compare by number rather than by text", () => {
  assert.deepEqual(labels(["GLM-5.2", "GLM-5.10", "GLM-5.3"]), ["GLM-5.10", "GLM-5.3", "GLM-5.2"]);
});

test("models without a version keep their listed order", () => {
  assert.deepEqual(labels(["Space Bunny", "Grok 4.6", "Hy3", "Grok 4.7"]), ["Space Bunny", "Grok 4.7", "Grok 4.6", "Hy3"]);
});
