import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { callWorkspaceTool } from "../server/mcp-workspace.ts";
import { providers } from "../server/providers/index.ts";
import { disposeRuntime } from "../server/runtime.ts";
import { store } from "../server/store.ts";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-subagents-"));
  const project = store.openProject(directory);
  const parent = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: "Subagent test" });
  const sessions = [];
  t.mock.method(providers.claude, "detect", async () => ({ available: true }));
  t.mock.method(providers.claude, "start", options => {
    const session = { threadId: options.threadId, emit: options.emit, sent: [], send(prompt) { this.sent.push(prompt); }, dispose() {} };
    sessions.push(session);
    return session;
  });
  t.after(async () => {
    disposeRuntime(parent.id);
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  return { parent, sessions };
}

test("concurrent subagent starts count preparation toward the four-agent limit", async t => {
  const { parent, sessions } = await fixture(t);
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, index) =>
    callWorkspaceTool(parent.id, "subagent_start", { title: `Child ${index}`, task: `Task ${index}` }),
  ));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 4);
  const rejected = results.filter(result => result.status === "rejected");
  assert.equal(rejected.length, 2);
  for (const result of rejected) assert.match(result.reason.message, /most it can run at once/);
  assert.equal(sessions.length, 4);
  assert.equal([...store.threads.values()].filter(thread => thread.parentThreadId === parent.id && thread.running).length, 4);
  sessions[0].emit({ type: "turn.end" });
  await callWorkspaceTool(parent.id, "subagent_start", { title: "Replacement", task: "Use the released slot" });
  assert.equal(sessions.length, 5);
});

test("failed subagent preparation releases its slot", async t => {
  const { parent, sessions } = await fixture(t);
  await assert.rejects(callWorkspaceTool(parent.id, "subagent_start", { title: "Invalid", task: "Read @[../outside]" }), /outside this workspace/);
  assert.equal(sessions.length, 0);
  const results = await Promise.allSettled(Array.from({ length: 4 }, (_, index) =>
    callWorkspaceTool(parent.id, "subagent_start", { title: `Child ${index}`, task: "Try again" }),
  ));
  assert.ok(results.every(result => result.status === "fulfilled"));
  assert.equal(sessions.length, 4);
});

test("subagent follow-ups respect the four-agent limit and reuse released slots", async t => {
  const { parent, sessions } = await fixture(t);
  await callWorkspaceTool(parent.id, "subagent_start", { title: "First", task: "Initial task" });
  const first = sessions[0];
  first.emit({ type: "turn.end" });
  await Promise.all(Array.from({ length: 4 }, (_, index) =>
    callWorkspaceTool(parent.id, "subagent_start", { title: `Child ${index}`, task: `Task ${index}` }),
  ));
  await assert.rejects(callWorkspaceTool(parent.id, "subagent_send", { id: first.threadId, text: "Follow up" }), /most it can run at once/);
  assert.deepEqual(first.sent, ["Initial task"]);
  sessions[1].emit({ type: "turn.end" });
  await callWorkspaceTool(parent.id, "subagent_send", { id: first.threadId, text: "Follow up" });
  assert.deepEqual(first.sent, ["Initial task", "Follow up"]);
  assert.equal([...store.threads.values()].filter(thread => thread.parentThreadId === parent.id && thread.running).length, 4);
});
