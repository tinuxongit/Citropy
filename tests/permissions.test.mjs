import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ask, answer, cancelThread, pendingRequests } from "../server/permissions.ts";
import { providers } from "../server/providers/index.ts";
import { runtimeFor, disposeRuntime } from "../server/runtime.ts";
import { store } from "../server/store.ts";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-permissions-"));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: "Permission test" });
  const runtime = runtimeFor(thread.id);
  let emit;
  t.mock.method(providers.claude, "start", options => {
    emit = options.emit;
    return { send() {}, interrupt() { emit({ type: "turn.end" }); }, dispose() {} };
  });
  t.after(async () => {
    cancelThread(thread.id);
    disposeRuntime(thread.id);
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  await runtime.send("Run commands");
  const request = () => pendingRequests().find(request => request.threadId === thread.id);
  return { thread, runtime, request, emit: event => emit(event) };
}

test("invalid permission answers cannot approve a tool or consume its request", async t => {
  const { thread, request } = await fixture(t);
  const result = ask(thread.id, "Bash", { command: "echo example" });
  const permission = request();
  for (const decision of ["approved", "", null, {}, true]) {
    assert.throws(() => answer(permission.id, decision), /decision/i);
    assert.equal(request().id, permission.id);
  }
  answer(permission.id, "deny");
  assert.equal(await result, "deny");
});

test("late approvals for stopped or deleted conversations are denied without prompting", async t => {
  const { thread, runtime, request } = await fixture(t);
  const previous = ask(thread.id, "Bash", { command: "echo earlier" });
  answer(request().id, "allow_always");
  assert.equal(await previous, "allow_always");
  runtime.stop();
  assert.equal(await ask(thread.id, "Bash", { command: "echo stopped" }), "deny");
  assert.equal(await ask(thread.id, "Edit", { file_path: "late.txt" }), "deny");
  assert.equal(request(), undefined);
  store.removeThread(thread.id);
  assert.equal(await ask(thread.id, "Bash", { command: "echo deleted" }), "deny");
  assert.equal(request(), undefined);
});

test("answering one of several approvals leaves the conversation waiting on the others", async t => {
  const { thread, request, emit } = await fixture(t);
  const first = ask(thread.id, "Bash", { command: "echo one" });
  const firstId = request().id;
  const second = ask(thread.id, "Edit", { file_path: "example.txt" });
  emit({ type: "status", status: "awaiting" });
  answer(firstId, "allow");
  assert.equal(await first, "allow");
  emit({ type: "status", status: "working", tool: "Bash" });
  assert.equal(thread.status, "awaiting");
  assert.equal(thread.activeTool, undefined);
  answer(request().id, "deny");
  assert.equal(await second, "deny");
  emit({ type: "status", status: "working", tool: "Bash" });
  assert.equal(thread.status, "working");
  assert.equal(thread.activeTool, "Bash");
});
