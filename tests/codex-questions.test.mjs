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
import { pendingQuestions, answerQuestion } from "../server/questions.ts";
import { runtimeFor, disposeRuntime } from "../server/runtime.ts";
import { store } from "../server/store.ts";

const tick = () => new Promise(resolve => setImmediate(resolve));
const title = "For the special powers, would you prefer abilities you activate with buttons, passive boosts, or a mix?";
const choices = ["Button-activated abilities (recommended)", "Passive powers", "A mix of both"];

async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for Codex.");
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-codex-questions-"));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "codex", permissionMode: "bypass", title: "Question test" });
  const runtime = runtimeFor(thread.id);
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.messages = [];
  child.receive = value => child.stdout.write(`${JSON.stringify(value)}\n`);
  let turns = 0;
  child.stdin.on("data", data => {
    for (const line of String(data).trim().split("\n")) {
      const message = JSON.parse(line);
      child.messages.push(message);
      if (message.id === undefined || !message.method) continue;
      let result = {};
      if (message.method === "thread/start") result = { thread: { id: "native-thread" } };
      if (message.method === "turn/start") result = { turn: { id: `turn_${++turns}` } };
      queueMicrotask(() => {
        child.receive({ id: message.id, result });
        if (message.method === "turn/interrupt") child.receive({ method: "turn/completed", params: { turn: { id: message.params.turnId, status: "interrupted" } } });
      });
    }
  });
  child.kill = signal => {
    child.signalCode = signal;
    queueMicrotask(() => { child.emit("exit", null, signal); child.emit("close", null, signal); });
    return true;
  };
  const spawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", (file, args, options) => args[0] === "app-server" ? child : spawn(file, args, options));
  syncBuiltinESMExports();
  const start = providers.codex.start;
  t.mock.method(providers.codex, "start", options => start({ ...options, binary: process.execPath, mcp: undefined }));
  t.after(async () => {
    disposeRuntime(thread.id);
    t.mock.restoreAll();
    syncBuiltinESMExports();
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  await runtime.send("Build special powers");
  await until(() => child.messages.some(message => message.method === "turn/start"));
  await tick();
  const ask = (id = "native-question", options = choices) => child.receive({ method: "item/completed", params: {
    threadId: "native-thread", turnId: `turn_${turns}`,
    item: { type: "agentMessage", id, text: title, phase: "final_answer", memoryCitation: null, delivery: "async", questions: [{ title, options }] },
  } });
  const finish = (status = "completed") => child.receive({ method: "turn/completed", params: { turn: { id: `turn_${turns}`, status, ...(status === "failed" ? { error: { message: "Turn failed" } } : {}) } } });
  const request = () => pendingQuestions().find(request => request.threadId === thread.id);
  return { thread, runtime, child, ask, finish, request };
}

test("Codex async questions create a widget and steer answers into the running turn once", async t => {
  const { thread, child, ask, request } = await fixture(t);
  ask();
  const question = request();
  assert.ok(question, "Async question metadata must produce a question request");
  assert.equal(question.questions[0].question, title);
  assert.deepEqual(question.questions[0].options.map(option => option.label), choices);
  assert.notEqual(thread.status, "awaiting");
  child.receive({ method: "turn/started", params: { turn: { id: "turn_1" } } });
  assert.equal(thread.status, "thinking");
  child.receive({ method: "item/started", params: { item: { id: "command", type: "commandExecution", command: "echo working", status: "inProgress" } } });
  assert.equal(thread.status, "working");
  assert.equal(thread.activeTool, "Bash");
  ask();
  assert.equal(pendingQuestions().filter(request => request.threadId === thread.id).length, 1);
  answerQuestion(thread.id, question.id, { question_1: [choices[2]] });
  await until(() => child.messages.some(message => message.method === "turn/steer"));
  await tick();
  const steer = child.messages.find(message => message.method === "turn/steer");
  assert.equal(steer.params.expectedTurnId, "turn_1");
  assert.ok(steer.params.input[0].text.includes(title));
  assert.ok(steer.params.input[0].text.includes(choices[2]));
  assert.ok(thread.messages.some(message => message.role === "user" && message.parts.some(part => part.kind === "text" && part.text.includes(choices[2]))));
  ask();
  await tick();
  assert.equal(request(), undefined);
  assert.equal(child.messages.filter(message => message.method === "turn/steer").length, 1);
  assert.equal(child.messages.filter(message => message.method === "turn/start").length, 1);
});

test("Codex async questions survive turn completion and answers start the next turn", async t => {
  const { thread, runtime, child, ask, finish, request } = await fixture(t);
  ask("freeform", null);
  const question = request();
  assert.ok(question);
  assert.deepEqual(question.questions[0].options, []);
  finish();
  await until(() => !runtime.busy);
  assert.equal(thread.running, false);
  assert.equal(thread.status, "idle");
  assert.equal(request().id, question.id);
  answerQuestion(thread.id, question.id, { question_1: ["Add a grappling hook"] });
  await until(() => child.messages.filter(message => message.method === "turn/start").length === 2);
  assert.ok(child.messages.findLast(message => message.method === "turn/start").params.input[0].text.includes("Add a grappling hook"));
  assert.equal(child.messages.some(message => message.method === "turn/steer"), false);
});

test("stopping, disposing, failing, and dismissing Codex async questions send no answer", async t => {
  for (const action of ["stop", "dispose", "fail", "dismiss", "answer then stop"]) {
    await t.test(action, async t => {
      const { thread, runtime, child, ask, finish, request } = await fixture(t);
      ask();
      const question = request();
      assert.ok(question);
      if (action === "answer then stop") answerQuestion(thread.id, question.id, { question_1: [choices[0]] });
      if (action === "stop" || action === "answer then stop") runtime.stop();
      else if (action === "dispose") disposeRuntime(thread.id);
      else if (action === "fail") finish("failed");
      else answerQuestion(thread.id, question.id, null);
      await tick();
      assert.equal(request(), undefined);
      assert.equal(child.messages.some(message => message.method === "turn/steer"), false);
      assert.equal(child.messages.filter(message => message.method === "turn/start").length, 1);
    });
  }
});

test("Codex blocking questions still wait and return structured RPC answers", async t => {
  const { thread, child, ask, request } = await fixture(t);
  ask();
  child.receive({ id: "blocking-rpc", method: "item/tool/requestUserInput", params: {
    threadId: "native-thread", turnId: "turn_1", itemId: "blocking-item", isBlocking: true,
    questions: [{ id: "scope", header: "Scope", question: "Choose scope", options: [{ label: "Small", description: "One ability" }] }],
  } });
  assert.equal(thread.status, "awaiting");
  const blocking = pendingQuestions().find(request => request.threadId === thread.id && request.questions[0].id === "scope");
  answerQuestion(thread.id, blocking.id, { scope: ["Small"] });
  await tick();
  assert.deepEqual(child.messages.find(message => message.id === "blocking-rpc").result, { answers: { scope: { answers: ["Small"] } } });
  assert.equal(thread.status, "working");
  assert.ok(request());
  assert.equal(child.messages.some(message => message.method === "turn/steer"), false);
});

test("Codex nonblocking RPC questions stay available without pausing the turn", async t => {
  const { thread, runtime, child, finish } = await fixture(t);
  child.receive({ id: "nonblocking-rpc", method: "item/tool/requestUserInput", params: {
    threadId: "native-thread", turnId: "turn_1", itemId: "nonblocking-item", isBlocking: false,
    questions: [{ id: "detail", question: "Any details?", options: [] }],
  } });
  const question = pendingQuestions().find(request => request.threadId === thread.id);
  assert.ok(question);
  assert.notEqual(thread.status, "awaiting");
  finish();
  await until(() => !runtime.busy);
  assert.ok(pendingQuestions().some(request => request.id === question.id));
  answerQuestion(thread.id, question.id, { detail: ["Keep it simple"] });
  await tick();
  assert.deepEqual(child.messages.find(message => message.id === "nonblocking-rpc").result, { answers: { detail: { answers: ["Keep it simple"] } } });
  assert.equal(child.messages.filter(message => message.method === "turn/start").length, 1);
});

test("ordinary Codex messages do not invent question widgets", async t => {
  const { child, request } = await fixture(t);
  child.receive({ method: "item/completed", params: { item: { type: "agentMessage", id: "plain", text: title, delivery: null, questions: null } } });
  assert.equal(request(), undefined);
});
