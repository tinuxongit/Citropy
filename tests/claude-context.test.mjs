import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import { claudeProvider } from "../server/providers/claude.ts";

function fixture(t, startOptions = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.messages = [];
  child.stdin.on("data", data => child.messages.push(JSON.parse(String(data))));
  child.kill = () => true;
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = () => child;
  syncBuiltinESMExports();
  const events = [];
  const session = claudeProvider.start({ threadId: "fixture", externalId: "resumed-session", cwd: process.cwd(), permissionMode: "manual", emit: event => events.push(event), ...startOptions });
  t.after(() => {
    session.dispose();
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  });
  return { session, events, child, receive: value => child.stdout.write(`${JSON.stringify(value)}\n`) };
}

const result = { type: "result", subtype: "success", is_error: false, result: "Done" };
const backgroundResult = { ...result, origin: { kind: "task-notification" }, num_turns: 0 };

test("Claude resume background results keep the user's turn open", async t => {
  const { session, events, child, receive } = fixture(t);
  await session.send("Continue the work");
  receive({ ...backgroundResult, total_cost_usd: 0.05 });
  assert.equal(events.some(event => event.type === "turn.end"), false);
  assert.equal(events.findLast(event => event.type === "usage").usage.costUsd, 0.05);
  await session.steer("Also run the tests");
  receive({ type: "user", isReplay: true, uuid: child.messages.at(-1).uuid });
  receive({ ...result, origin: { kind: "human" } });
  assert.equal(events.filter(event => event.type === "turn.end").length, 1);
});

test("Claude ends the turn when a background run reads the user's message", async t => {
  const { session, events, receive } = fixture(t);
  await session.send("How is it going?");
  receive({ type: "user", isReplay: true, uuid: "read-during-background-run" });
  receive(backgroundResult);
  assert.equal(events.filter(event => event.type === "turn.end").length, 1);
  receive(backgroundResult);
  assert.equal(events.filter(event => event.type === "turn.end").length, 1);
});

test("Claude resume background results do not fail a queued manual compaction", async t => {
  const { session, events, receive } = fixture(t);
  await session.compact();
  receive(backgroundResult);
  assert.equal(events.some(event => event.type === "turn.end"), false);
  receive({ type: "system", subtype: "compact_boundary", compact_metadata: { pre_tokens: 150_000, post_tokens: 10_000 } });
  receive({ ...result, local_command: "compact" });
  assert.equal(events.some(event => event.type === "turn.end"), false);
  assert.deepEqual(events.filter(event => event.type === "compacted"), [{ type: "compacted", contextTokens: 10_000 }]);
});

test("Claude context usage keeps updating after manual and automatic compaction", async t => {
  for (const manual of [false, true]) {
    await t.test(manual ? "manual" : "automatic", async t => {
      const { session, events, receive } = fixture(t);
      if (manual) await session.compact();
      else await session.send("Continue the work");
      receive({ type: "system", subtype: "compact_boundary", compact_metadata: { post_tokens: 10_000 } });
      receive({ ...result, usage: { iterations: [{ type: "message", input_tokens: 150_000, output_tokens: 1_000 }] } });
      assert.equal(events.findLast(event => event.type === "usage").usage.contextTokens, 10_000);
      await session.send("Continue after compacting");
      receive({ ...result, usage: { iterations: [{ type: "message", input_tokens: 12_000, cache_read_input_tokens: 2_000, output_tokens: 500 }] } });
      assert.equal(events.findLast(event => event.type === "usage").usage.contextTokens, 14_500);
    });
  }
});

test("Claude reports when automatic compaction starts and when it fails", async t => {
  const { session, events, receive } = fixture(t);
  await session.send("Continue the work");
  receive({ type: "system", subtype: "status", status: "compacting" });
  assert.deepEqual(events.findLast(event => event.type === "compacting"), { type: "compacting", active: true });
  receive({ type: "system", subtype: "status", status: null, compact_result: "failed", compact_error: "Prompt too long" });
  assert.deepEqual(events.findLast(event => event.type === "compacting"), { type: "compacting", active: false });
  assert.equal(events.findLast(event => event.type === "notice").text, "Claude Code could not compact the context. Prompt too long");
});

test("Claude reporting a larger context window does not change the configured window", async t => {
  const { session, events, receive } = fixture(t);
  receive({ ...result, modelUsage: { "claude-opus-5-5": { contextWindow: 1_000_000 } } });
  assert.equal(events.findLast(event => event.type === "usage").usage.contextMax, 1_000_000);
  await session.configure({});
  await assert.rejects(session.configure({ contextMax: 1_000_000 }), /restart/);
});

test("Claude reporting a smaller context window does not change the configured window", async t => {
  const { session, receive } = fixture(t, { contextMax: 1_000_000 });
  receive({ ...result, modelUsage: { "claude-opus-5-5": { contextWindow: 200_000 } } });
  await session.configure({ contextMax: 1_000_000 });
  await assert.rejects(session.configure({ contextMax: 200_000 }), /restart/);
});
