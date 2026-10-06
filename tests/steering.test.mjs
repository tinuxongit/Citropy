import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { providers } from "../server/providers/index.ts";
import { claudeProvider } from "../server/providers/claude.ts";
import { runtimeFor, runtimeIfExists, disposeRuntime, closeIdleSessions } from "../server/runtime.ts";
import { store } from "../server/store.ts";
import { threadRoutes } from "../server/routes/threads.ts";

const tick = () => new Promise(resolve => setImmediate(resolve));

async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for the runtime to settle.");
}

async function fixture(t, permissionMode = "manual", configure) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-steering-"));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode, title: "Steering test" });
  const runtime = runtimeFor(thread.id);
  const provider = { sent: [], sentModes: [], steered: [], starts: [], emit: undefined, finishInterrupt: undefined };
  t.mock.method(providers.claude, "start", options => {
    provider.starts.push(options);
    provider.emit = options.emit;
    return {
      send: prompt => { provider.sent.push(prompt); provider.sentModes.push(thread.permissionMode); },
      steer: async prompt => { provider.steered.push(prompt); },
      interrupt: () => new Promise(resolve => { provider.finishInterrupt = resolve; }),
      ...(configure ? { configure } : {}),
      dispose() { provider.disposed = true; },
    };
  });
  t.after(async () => {
    disposeRuntime(thread.id);
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  return { thread, runtime, provider };
}

const texts = thread => (thread.queue ?? []).map(item => item.text);

test("idle sessions with paused queues release their process and retain resumable work", async t => {
  for (const reason of ["stop", "usage limit"]) {
    await t.test(reason, async t => {
      const { thread, runtime, provider } = await fixture(t);
      await runtime.send("First");
      await runtime.send("Queued request");
      store.patchThread(thread.id, { externalId: "saved-session" });
      if (reason === "stop") runtime.stop();
      provider.emit({ type: "turn.end", ...(reason === "usage limit" ? { error: "Usage limit reached" } : {}) });
      if (reason === "stop") provider.finishInterrupt();
      await until(() => !runtime.busy);
      const { queue, status, usageLimit } = thread;
      const now = Date.now();
      closeIdleSessions(now);
      closeIdleSessions(now + 60 * 60_000 - 1);
      assert.equal(runtimeIfExists(thread.id), runtime);
      closeIdleSessions(now + 60 * 60_000);
      assert.equal(runtimeIfExists(thread.id), undefined);
      assert.equal(provider.disposed, true);
      assert.deepEqual(thread.queue, queue);
      assert.equal(thread.status, status);
      assert.deepEqual(thread.usageLimit, usageLimit);
      assert.equal(thread.externalId, "saved-session");
      await runtimeFor(thread.id).sendNow(queue[0].id);
      assert.deepEqual(provider.sent, ["First", "Queued request"]);
      assert.equal(provider.starts.length, 2);
      assert.equal(provider.starts[1].externalId, "saved-session");
      assert.deepEqual(texts(thread), []);
    });
  }
});

test("changing settings does not resume messages left queued by Stop", async t => {
  const { thread, runtime, provider } = await fixture(t, "manual", async () => {});
  await runtime.send("First");
  await runtime.send("Still queued");
  runtime.stop();
  provider.emit({ type: "turn.end" });
  provider.finishInterrupt();
  await until(() => !runtime.busy);
  await threadRoutes["thread.config"]({ t: "thread.config", id: thread.id, permissionMode: "bypass" }, () => {});
  await until(() => !runtime.busy || provider.sent.length > 1);
  assert.deepEqual(provider.sent, ["First"]);
  assert.deepEqual(texts(thread), ["Still queued"]);
  assert.equal(thread.status, "stopped");
  await runtime.send("New request");
  assert.deepEqual(provider.sent, ["First", "New request"]);
  assert.deepEqual(texts(thread), ["Still queued"]);
});

test("Stop cancels messages waiting for an idle settings update", async t => {
  const change = Promise.withResolvers();
  let configuring = false;
  const { thread, runtime, provider } = await fixture(t, "manual", async () => {
    configuring = true;
    await change.promise;
  });
  await runtime.send("First");
  provider.emit({ type: "turn.end" });
  await until(() => !runtime.busy);
  const update = threadRoutes["thread.config"]({ t: "thread.config", id: thread.id, permissionMode: "bypass" }, () => {});
  await until(() => configuring);
  const sending = runtime.send("Cancelled request");
  const settled = Promise.allSettled([update, sending]);
  runtime.stop();
  change.resolve();
  const results = await settled;
  assert.ok(results.every(result => result.status === "rejected" && /stopped/.test(result.reason.message)));
  assert.deepEqual(provider.sent, ["First"]);
  assert.equal(thread.status, "stopped");
  await runtime.send("After stop");
  assert.deepEqual(provider.sent, ["First", "After stop"]);
  assert.equal(thread.permissionMode, "bypass");
});

test("messages sent during an idle settings change wait for its result without being stopped", async t => {
  for (const outcome of ["success", "failure"]) {
    await t.test(outcome, async t => {
      const change = Promise.withResolvers();
      let configuring = false;
      const { thread, runtime, provider } = await fixture(t, "manual", async () => {
        configuring = true;
        await change.promise;
      });
      await runtime.send("First");
      provider.emit({ type: "turn.end" });
      await until(() => !runtime.busy);
      const update = threadRoutes["thread.config"]({ t: "thread.config", id: thread.id, permissionMode: "bypass" }, () => {});
      await until(() => configuring);
      const sending = runtime.send("Second");
      await tick();
      if (outcome === "success") change.resolve();
      else change.reject(new Error("Mode update failed"));
      await update;
      await sending;
      await until(() => provider.sent.length === 2);
      assert.deepEqual(provider.sentModes, ["manual", "bypass"]);
      assert.equal(thread.running, true);
      assert.equal(thread.permissionMode, "bypass");
      assert.deepEqual(texts(thread), []);
    });
  }
});

test("settings updated while a queued change is applying reach the next turn", async t => {
  const firstChange = Promise.withResolvers();
  const applied = [];
  const { thread, runtime, provider } = await fixture(t, "manual", async config => {
    applied.push(config.permissionMode);
    if (applied.length === 1) await firstChange.promise;
  });
  await runtime.send("First");
  await threadRoutes["thread.config"]({ t: "thread.config", id: thread.id, permissionMode: "acceptEdits" }, () => {});
  provider.emit({ type: "turn.end" });
  await until(() => !runtime.busy);
  const sending = runtime.send("Second");
  await until(() => applied.length === 1);
  await threadRoutes["thread.config"]({ t: "thread.config", id: thread.id, permissionMode: "bypass" }, () => {});
  firstChange.resolve();
  await sending;
  assert.deepEqual(applied, ["acceptEdits", "bypass"]);
  assert.equal(thread.permissionMode, "bypass");
  assert.equal(thread.pendingConfig, undefined);
  assert.deepEqual(provider.sent, ["First", "Second"]);
});

test("Send now delivers normally when the turn ends before the steer goes out", async t => {
  const { thread, runtime, provider } = await fixture(t);
  await runtime.send("First");
  await runtime.send("Steer me");
  await runtime.send("Later");
  const pending = runtime.sendNow(thread.queue[0].id);
  provider.emit({ type: "turn.end" });
  await pending;
  await until(() => provider.sent.length === 2);
  assert.deepEqual(provider.steered, []);
  assert.deepEqual(provider.sent, ["First", "Steer me"]);
  assert.deepEqual(texts(thread), ["Later"]);
  assert.equal(thread.running, true);
});

test("A message sent while the queue is draining joins the back of the queue", async t => {
  const { thread, runtime, provider } = await fixture(t);
  await runtime.send("First");
  await runtime.send("Queued");
  provider.emit({ type: "turn.end" });
  await runtime.send("Newest");
  await until(() => provider.sent.length === 2);
  assert.deepEqual(provider.sent, ["First", "Queued"]);
  assert.deepEqual(texts(thread), ["Newest"]);
});

test("Messages sent while a stop finishes go out one at a time", async t => {
  const { thread, runtime, provider } = await fixture(t);
  await runtime.send("First");
  runtime.stop();
  const next = runtime.send("After stop");
  await tick();
  provider.emit({ type: "turn.end" });
  await runtime.send("Second after stop");
  provider.finishInterrupt();
  await next;
  assert.deepEqual(provider.sent, ["First", "After stop"]);
  assert.deepEqual(texts(thread), ["Second after stop"]);
});

test("Stopping while Send now is preparing keeps the message queued without an error", async t => {
  const { thread, runtime, provider } = await fixture(t);
  await runtime.send("First");
  await runtime.send("Steer me");
  const pending = runtime.sendNow(thread.queue[0].id);
  runtime.stop();
  await pending;
  assert.deepEqual(provider.steered, []);
  assert.deepEqual(texts(thread), ["Steer me"]);
});

test("stopping an accepted plan during its mode change prevents automatic implementation", async t => {
  for (const outcome of ["resolve", "reject"]) {
    await t.test(outcome, async t => {
      const { promise, resolve, reject } = Promise.withResolvers();
      const { thread, runtime, provider } = await fixture(t, "plan", () => promise);
      await runtime.send("Make a plan");
      await runtime.send("Queued request");
      provider.emit({ type: "plan.accepted" });
      provider.emit({ type: "turn.end" });
      runtime.stop();
      if (outcome === "resolve") resolve();
      else reject(new Error("Mode change failed"));
      await until(() => !runtime.busy);
      assert.deepEqual(provider.sent, ["Make a plan"]);
      assert.deepEqual(texts(thread), ["Queued request"]);
      assert.equal(thread.status, "stopped");
      assert.equal(thread.running, false);
      assert.equal(thread.permissionMode, "plan");
      assert.equal(provider.disposed, true);
      await runtime.sendNow(thread.queue[0].id);
      assert.deepEqual(provider.sent, ["Make a plan", "Queued request"]);
      assert.equal(thread.permissionMode, "plan");
    });
  }
});

test("disposing an accepted plan during its mode change preserves the stopped conversation", async t => {
  const { promise, resolve } = Promise.withResolvers();
  const { thread, runtime, provider } = await fixture(t, "plan", () => promise);
  await runtime.send("Make a plan");
  provider.emit({ type: "plan.accepted" });
  provider.emit({ type: "turn.end" });
  disposeRuntime(thread.id);
  resolve();
  await until(() => !runtime.busy);
  assert.deepEqual(provider.sent, ["Make a plan"]);
  assert.deepEqual(texts(thread), []);
  assert.equal(thread.status, "stopped");
  assert.equal(thread.permissionMode, "plan");
});

test("an accepted plan still implements automatically after a successful mode change", async t => {
  const { promise, resolve } = Promise.withResolvers();
  const { thread, runtime, provider } = await fixture(t, "plan", () => promise);
  await runtime.send("Make a plan");
  provider.emit({ type: "plan.accepted" });
  provider.emit({ type: "turn.end" });
  assert.deepEqual(provider.sent, ["Make a plan"]);
  resolve();
  await until(() => provider.sent.length === 2);
  assert.deepEqual(provider.sent, ["Make a plan", "Build the plan."]);
  assert.equal(thread.permissionMode, "manual");
  assert.equal(thread.running, true);
  assert.equal(runtime.turnActive, true);
});

test("Claude Code", async t => {
  const originalSpawn = childProcess.spawn;
  const children = [];
  childProcess.spawn = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.messages = [];
    child.stdin.on("data", data => String(data).trim().split("\n").forEach(line => child.messages.push(JSON.parse(line))));
    child.receive = value => child.stdout.write(`${JSON.stringify(value)}\n`);
    child.kill = signal => {
      child.signals = [...(child.signals ?? []), signal];
      return true;
    };
    children.push(child);
    return child;
  };
  syncBuiltinESMExports();
  const sessions = [];
  t.after(() => {
    sessions.forEach(session => session.dispose());
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  });
  const start = () => {
    const events = [];
    const session = claudeProvider.start({ threadId: "fixture", cwd: process.cwd(), permissionMode: "manual", emit: event => events.push(event) });
    sessions.push(session);
    return { session, events, child: children.at(-1) };
  };
  const result = { type: "result", subtype: "success", is_error: false, result: "Done" };

  await t.test("keeps the turn open until a steered message that arrived at the end has run", async () => {
    const { session, events, child } = start();
    await session.send("Write a poem");
    await session.steer("Now say banana");
    await tick();
    const steer = child.messages.at(-1);
    assert.equal(steer.priority, "next");
    child.receive(result);
    await tick();
    assert.equal(events.some(event => event.type === "turn.end"), false);
    child.receive({ type: "user", isReplay: true, uuid: steer.uuid, message: { role: "user", content: [{ type: "text", text: "Now say banana" }] } });
    child.receive(result);
    await tick();
    assert.equal(events.filter(event => event.type === "turn.end").length, 1);
  });

  await t.test("ends the turn once when the steered message is read during it", async () => {
    const { session, events, child } = start();
    await session.send("Run a command");
    await session.steer("Also say banana");
    await tick();
    child.receive({ type: "user", isReplay: true, uuid: child.messages.at(-1).uuid, message: { role: "user", content: [] } });
    child.receive(result);
    await tick();
    assert.equal(events.filter(event => event.type === "turn.end").length, 1);
  });

  await t.test("refuses to steer after the turn has ended", async () => {
    const { session, child } = start();
    await session.send("Hello");
    child.receive(result);
    await tick();
    await assert.rejects(session.steer("Too late"), /already finished/);
  });

  await t.test("stop waits for the process to exit and reports unread steered messages", async () => {
    const { session, events, child } = start();
    await session.send("Run a command");
    await session.steer("Unread");
    let stopped = false;
    const stopping = Promise.resolve(session.interrupt()).then(() => { stopped = true; });
    assert.deepEqual(child.signals, ["SIGINT"]);
    assert.match(events.at(-1).text, /Stopped before Claude Code read your latest message/);
    await tick();
    assert.equal(stopped, false);
    child.exitCode = 0;
    child.emit("exit", 0, null);
    await stopping;
  });
});
