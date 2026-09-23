import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("providers surface stray non-JSON stdout as warnings", async (t) => {
  const originalSpawn = childProcess.spawn;
  const children = [];
  childProcess.spawn = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => true;
    children.push(child);
    return child;
  };
  syncBuiltinESMExports();
  t.after(() => {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  });

  const { claudeProvider } = await import("../server/providers/claude.ts");
  const { codexProvider } = await import("../server/providers/codex.ts");
  const options = { threadId: "fixture", cwd: process.cwd(), permissionMode: "manual" };

  const claudeEvents = [];
  const claudeSession = claudeProvider.start({ ...options, emit: (event) => claudeEvents.push(event) });
  t.after(() => claudeSession.dispose());
  const claude = children.at(-1);
  claude.stdout.write("Deprecation warning: --foo is deprecated\n");
  await tick();
  assert.ok(claudeEvents.some((event) => event.type === "notice" && event.level === "warn" && /Deprecation warning/.test(event.text)));

  const codexEvents = [];
  const codexSession = codexProvider.start({ ...options, emit: (event) => codexEvents.push(event) });
  t.after(() => codexSession.dispose());
  const codex = children.at(-1);
  codex.stdout.write("codex: noisy warning\n");
  await tick();
  assert.ok(codexEvents.some((event) => event.type === "notice" && event.level === "warn" && /noisy warning/.test(event.text)));

  await t.test("handler errors report their cause without displaying command payloads", async () => {
    for (const provider of [claudeProvider, codexProvider]) {
      const events = [];
      const session = provider.start({ ...options, emit(event) {
        if (event.type === "tool.start" || event.type === "block.start") throw new Error("Persistence unavailable");
        events.push(event);
      } });
      const child = children.at(-1);
      const wire = provider.id === "claude"
        ? { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call", name: "Bash", input: { command: "private-command" } } } }
        : { method: "item/agentMessage/delta", params: { itemId: "call", delta: "private-command" } };
      child.stdout.write(`${JSON.stringify(wire)}\n`);
      await tick();
      assert.ok(events.some(event => event.type === "notice" && event.level === "error" && event.text.includes("Persistence unavailable")));
      assert.ok(events.some(event => event.type === "exit" && event.code !== 0));
      assert.equal(JSON.stringify(events).includes("private-command"), false);
      session.dispose();
    }
  });
});
