import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import packageInfo from "../package.json" with { type: "json" };
import { discoverModels } from "../server/providers/models.ts";

function fakeChild(respond) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.messages = [];
  child.stdin.on("data", data => {
    for (const line of String(data).trim().split("\n")) {
      const message = JSON.parse(line);
      child.messages.push(message);
      const reply = respond(message);
      if (reply) queueMicrotask(() => child.stdout.write(`${JSON.stringify(reply)}\n`));
    }
  });
  child.kill = signal => {
    child.signalCode = signal;
    queueMicrotask(() => { child.emit("exit", null, signal); child.emit("close", null, signal); });
    return true;
  };
  return child;
}

function mockSpawn(t, respond) {
  const children = [];
  t.mock.method(childProcess, "spawn", () => {
    const child = fakeChild(respond);
    children.push(child);
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return children;
}

const claudeInit = models => message => message.request_id === "init"
  ? { type: "control_response", response: { request_id: "init", subtype: "success", response: { models, commands: [] } } }
  : undefined;

const codexPages = pages => message => {
  if (message.method === "initialize") return { id: message.id, result: {} };
  if (message.method === "model/list") return { id: message.id, result: pages[message.params.cursor ?? ""] };
};

test("Claude model discovery reads the initialize control response", async t => {
  const children = mockSpawn(t, claudeInit([{ value: "default", displayName: "Default (recommended)", resolvedModel: "claude-opus-4-5" }]));
  const models = await discoverModels("claude");
  assert.deepEqual(models.map(model => [model.id, model.label, model.isDefault]), [["claude-opus-4-5", "Claude Opus 4.5", true]]);
  assert.equal(children.length, 1);
});

test("Codex model discovery lists models after the initialize handshake", async t => {
  const children = mockSpawn(t, codexPages({
    "": { data: [{ model: "gpt-5", displayName: "GPT-5", isDefault: true }, { model: "internal", displayName: "Internal", hidden: true }], nextCursor: null },
  }));
  const models = await discoverModels("codex");
  assert.deepEqual(models.map(model => [model.id, model.label]), [["gpt-5", "GPT-5"]]);
  assert.deepEqual(children[0].messages.map(message => message.id ?? message.method), [1, "initialized", 2]);
});

test("Codex model discovery follows cursors and rejects a repeated one", async t => {
  const children = mockSpawn(t, codexPages({
    "": { data: [{ model: "first", displayName: "First" }], nextCursor: "page-2" },
    "page-2": { data: [{ model: "second", displayName: "Second" }], nextCursor: "page-2" },
  }));
  await assert.rejects(discoverModels("codex"), /repeated model cursor/);
  assert.equal(children.length, 2);
  assert.deepEqual(children[1].messages.at(-1).params, { cursor: "page-2" });
});

test("Codex initialize reports the app version", async t => {
  const children = mockSpawn(t, codexPages({ "": { data: [], nextCursor: null } }));
  await discoverModels("codex");
  const initialize = children[0].messages.find(message => message.method === "initialize");
  assert.deepEqual(initialize.params.clientInfo, { name: "citropy", version: packageInfo.version });
});
