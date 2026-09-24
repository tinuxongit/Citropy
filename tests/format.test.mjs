import assert from "node:assert/strict";
import { test } from "node:test";
import { duration, modelSource } from "../web/src/lib/format.ts";

test("elapsed durations carry rounded seconds into the next minute", () => {
  assert.equal(duration(59_400), "59s");
  assert.equal(duration(59_500), "1m 0s");
  assert.equal(duration(60_000), "1m 0s");
  assert.equal(duration(2_159_499), "35m 59s");
  assert.equal(duration(2_159_500), "36m 0s");
  assert.equal(duration(2_161_000), "36m 1s");
});

test("model sources show provider names and format unknown IDs", () => {
  const pi = { id: "pi", label: "Pi" };
  const opencode = { id: "opencode", label: "OpenCode" };
  assert.equal(modelSource(pi, { id: "openai/gpt-test", label: "GPT Test", hint: "openai" }), "OpenAI");
  assert.equal(modelSource(pi, { id: "opencode/claude-test", label: "Claude Test", hint: "opencode" }), "OpenCode Zen");
  assert.equal(modelSource(pi, { id: "opencode-go/gpt-test", label: "GPT Test", hint: "opencode-go" }), "OpenCode Go");
  assert.equal(modelSource(opencode, { id: "stepfun/step-test", label: "Step Test", hint: "stepfun" }), "StepFun");
  assert.equal(modelSource(pi, { id: "cloudflare-ai-gateway/model", label: "Model" }), "Cloudflare AI Gateway");
  assert.equal(modelSource(pi, { id: "moonshotai-cn/model", label: "Model" }), "Moonshot AI (China)");
  assert.equal(modelSource(pi, { id: "xai/model", label: "Model" }), "xAI");
  assert.equal(modelSource(pi, { id: "zai/model", label: "Model" }), "Z.AI");
  assert.equal(modelSource(opencode, { id: "302ai/model", label: "Model" }), "302.AI");
  assert.equal(modelSource(pi, { id: "custom-provider/model", label: "Model" }), "Custom Provider");
  assert.equal(modelSource(pi, { id: "Acme.Cloud/model", label: "Model" }), "Acme.Cloud");
  assert.equal(modelSource(pi, { id: "toString/model", label: "Model" }), "toString");
  assert.equal(modelSource({ id: "claude", label: "Claude Code" }, { id: "claude-test", label: "Test" }), "Claude Code");
});
