import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

const tick = () => new Promise(resolve => setImmediate(resolve));

test("provider shells expose background lifetime and targeted stop protocols", async (t) => {
  const originalSpawn = childProcess.spawn;
  const children = [];
  const sessions = [];
  childProcess.spawn = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.messages = [];
    child.stdin.on("data", data => child.messages.push(JSON.parse(String(data))));
    child.receive = value => child.stdout.write(`${JSON.stringify(value)}\n`);
    child.kill = signal => {
      child.signalCode = signal;
      queueMicrotask(() => { child.emit("exit", null, signal); child.emit("close", null, signal); });
      return true;
    };
    children.push(child);
    return child;
  };
  syncBuiltinESMExports();
  t.after(() => {
    sessions.forEach(session => session.dispose());
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  });
  const { claudeProvider } = await import("../server/providers/claude.ts");
  const { codexProvider } = await import("../server/providers/codex.ts");
  const options = { threadId: "fixture", cwd: process.cwd(), permissionMode: "manual" };

  await t.test("Claude promotes native background Bash and acknowledges only its stop response", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    child.receive({ type: "system", subtype: "task_started", task_type: "local_bash", task_id: "native", tool_use_id: "bash" });
    assert.deepEqual(events.at(-1), { type: "shell.background", callId: "bash", taskId: "native" });
    child.receive({ type: "system", subtype: "task_progress", task_id: "native" });
    assert.equal(events.at(-1).callId, "bash");
    const stopped = session.stopShell("native");
    const request = child.messages.at(-1);
    assert.deepEqual(request.request, { subtype: "stop_task", task_id: "native" });
    let resolved = false;
    void stopped.then(() => { resolved = true; });
    child.receive({ type: "control_response", response: { request_id: "wrong", subtype: "success" } });
    await tick();
    assert.equal(resolved, false);
    child.receive({ type: "control_response", response: { request_id: request.request_id, subtype: "success" } });
    await stopped;
    child.receive({ type: "system", subtype: "task_notification", task_id: "native", status: "completed", summary: "Server stopped" });
    assert.deepEqual(events.at(-1), { type: "shell.end", callId: "bash", ok: true, output: "Server stopped" });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_bash", task_id: "reject", tool_use_id: "other" });
    const rejected = session.stopShell("reject");
    child.receive({ type: "control_response", response: { request_id: child.messages.at(-1).request_id, subtype: "error", error: "Cannot stop" } });
    await assert.rejects(rejected, /Cannot stop/);
    const cancelled = session.stopShell("reject");
    session.dispose();
    await assert.rejects(cancelled, /closed/);
  });

  await t.test("Claude lists each background workflow agent as a subagent", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    const subagents = () => events.filter(event => event.type === "subagent");
    child.receive({ type: "system", subtype: "task_started", task_type: "local_workflow", task_id: "flow", tool_use_id: "call" });
    child.receive({ type: "system", subtype: "task_progress", task_id: "flow", tool_use_id: "call", workflow_progress: [
      { type: "workflow_agent", index: 0, label: "find:server", state: "start", startedAt: 1, model: "claude-opus-5-5", promptPreview: "Review the server" },
      { type: "workflow_agent", index: 1, label: "find:web", state: "start", queuedAt: 1 },
      { type: "workflow_log", message: "ignored" },
    ] });
    assert.deepEqual(subagents().map(event => [event.id, event.title, event.status]), [["call:0", "find:server", "working"], ["call:1", "find:web", "queued"]]);
    assert.equal(subagents()[0].prompt, "Review the server");
    assert.equal(subagents()[0].model, "claude-opus-5-5");
    child.receive({ type: "system", subtype: "task_progress", task_id: "flow", tool_use_id: "call" });
    child.receive({ type: "system", subtype: "task_progress", task_id: "flow", tool_use_id: "call", workflow_progress: [
      { type: "workflow_agent", index: 0, label: "find:server", state: "done", resultPreview: "No bugs" },
      { type: "workflow_agent", index: 1, label: "find:web", state: "progress", startedAt: 2 },
    ] });
    assert.deepEqual(subagents().slice(2).map(event => [event.id, event.status, event.result]), [["call:0", "idle", "No bugs"], ["call:1", "working", undefined]]);
    child.receive({ type: "system", subtype: "task_notification", task_id: "flow", tool_use_id: "call", status: "killed" });
    assert.deepEqual(subagents().slice(4), [{ type: "subagent", id: "call:1", status: "stopped" }]);
  });

  await t.test("Claude follows a subagent by its task id across launch, resume and stop", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    const subagents = () => events.filter(event => event.type === "subagent");
    child.receive({ type: "assistant", message: { content: [{ type: "tool_use", id: "launch", name: "Agent", input: { description: "Coder", prompt: "Build blocks", model: "haiku", run_in_background: true } }] } });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_agent", task_id: "agent", tool_use_id: "launch", description: "Coder", prompt: "Build blocks" });
    child.receive({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "launch", content: [{ type: "text", text: "Async agent launched successfully." }] }] }, tool_use_result: { status: "async_launched", agentId: "agent" } });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_bash", task_id: "sleep", tool_use_id: "bash", owned_by_subagent: true });
    child.receive({ type: "system", subtype: "task_notification", task_id: "sleep", tool_use_id: "bash", status: "completed", summary: "Sleep" });
    child.receive({ type: "system", subtype: "task_notification", task_id: "agent", tool_use_id: "launch", status: "completed", summary: "Blocks built" });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_agent", task_id: "agent", tool_use_id: "resume", description: "Coder", prompt: "Add textures" });
    child.receive({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "resume", content: [{ type: "text", text: "{\"success\":true}" }] }] }, tool_use_result: { success: true, resumedAgentId: "agent" } });
    child.receive({ type: "system", subtype: "task_notification", task_id: "agent", tool_use_id: "resume", status: "stopped", summary: "Coder" });
    assert.deepEqual(subagents(), [
      { type: "subagent", id: "agent", title: "Coder", model: "haiku", status: "working", runPrompt: "Build blocks", launchId: "launch" },
      { type: "subagent", id: "agent", status: "idle", result: "Blocks built" },
      { type: "subagent", id: "agent", title: "Coder", status: "working", runPrompt: "Add textures" },
      { type: "subagent", id: "agent", status: "stopped" },
    ]);
    assert.equal(events.some(event => event.type.startsWith("shell.")), false);
  });

  await t.test("Claude streams a subagent's own work into its chat and keeps the streamed reply as its result", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    child.receive({ type: "assistant", message: { content: [{ type: "tool_use", id: "launch", name: "Agent", input: { description: "Coder", prompt: "Build blocks" } }] } });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_agent", task_id: "agent", tool_use_id: "launch", description: "Coder", prompt: "Build blocks" });
    child.receive({ type: "assistant", parent_tool_use_id: "launch", uuid: "one", message: { content: [{ type: "thinking", thinking: "Plan it" }] } });
    child.receive({ type: "assistant", parent_tool_use_id: "launch", uuid: "two", message: { content: [{ type: "tool_use", id: "bash", name: "Bash", input: { command: "ls" } }] } });
    child.receive({ type: "user", parent_tool_use_id: "launch", uuid: "three", message: { content: [{ type: "tool_result", tool_use_id: "bash", content: "blocks.ts" }] } });
    child.receive({ type: "assistant", parent_tool_use_id: "launch", uuid: "four", message: { content: [{ type: "text", text: "Blocks built" }] } });
    child.receive({ type: "system", subtype: "task_notification", task_id: "agent", tool_use_id: "launch", status: "completed", summary: "Blocks built" });
    assert.deepEqual(events.filter(event => event.type === "subagent.activity").map(event => event.event), [
      { type: "block.start", blockId: "agent:one:0", block: "reasoning" },
      { type: "block.delta", blockId: "agent:one:0", text: "Plan it" },
      { type: "block.end", blockId: "agent:one:0" },
      { type: "tool.start", callId: "bash", name: "Bash", input: { command: "ls" } },
      { type: "tool.end", callId: "bash", ok: true, output: "blocks.ts" },
      { type: "block.start", blockId: "agent:four:0", block: "text" },
      { type: "block.delta", blockId: "agent:four:0", text: "Blocks built" },
      { type: "block.end", blockId: "agent:four:0" },
    ]);
    assert.deepEqual(events.filter(event => event.type === "subagent").at(-1), { type: "subagent", id: "agent", status: "idle" });
    assert.equal(events.some(event => event.callId === "bash" || event.blockId?.startsWith("agent:")), false);
  });

  await t.test("Claude nests a subagent's own subagents under it and shows their report on the launch card", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    child.receive({ type: "assistant", message: { content: [{ type: "tool_use", id: "launch", name: "Agent", input: { description: "Lead", prompt: "Delegate" } }] } });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_agent", task_id: "lead", tool_use_id: "launch", description: "Lead", prompt: "Delegate" });
    child.receive({ type: "assistant", parent_tool_use_id: "launch", uuid: "one", message: { content: [{ type: "tool_use", id: "inner", name: "Agent", input: { description: "Leaf", prompt: "Say hi", model: "haiku" } }] } });
    child.receive({ type: "system", subtype: "task_started", task_type: "local_agent", task_id: "leaf", tool_use_id: "inner", description: "Leaf", prompt: "Say hi" });
    child.receive({ type: "system", subtype: "task_notification", task_id: "leaf", tool_use_id: "inner", status: "completed", summary: "hi" });
    child.receive({ type: "user", parent_tool_use_id: "launch", uuid: "two", message: { content: [{ type: "tool_result", tool_use_id: "inner", content: [{ type: "text", text: "[Subagent hand-back] The report follows:\n  hi" }] }] } });
    assert.deepEqual(events.filter(event => event.type === "subagent").slice(1, 2), [{ type: "subagent", id: "leaf", title: "Leaf", model: "haiku", status: "working", runPrompt: "Say hi", launchId: "inner", parent: "lead" }]);
    assert.deepEqual(events.at(-1), { type: "subagent.activity", id: "lead", event: { type: "tool.end", callId: "inner", ok: true, output: "hi" } });
  });

  await t.test("Claude gives a cloud session its own subagent chat", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    child.receive({ type: "system", subtype: "task_started", task_type: "remote_agent", task_id: "cloud", tool_use_id: "review", description: "Cloud review", prompt: "Review the branch" });
    child.receive({ type: "system", subtype: "task_notification", task_id: "cloud", tool_use_id: "review", status: "completed", summary: "Cloud review completed" });
    assert.deepEqual(events.filter(event => event.type === "subagent"), [
      { type: "subagent", id: "cloud", title: "Cloud review", status: "working", runPrompt: "Review the branch" },
      { type: "subagent", id: "cloud", status: "idle", result: "Cloud review completed" },
    ]);
  });

  await t.test("Claude shows a resumed subagent's work after a restart from its saved launch", async () => {
    const events = [];
    const session = claudeProvider.start({ ...options, subagentLaunches: { launch: "agent" }, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    child.receive({ type: "system", subtype: "task_started", task_type: "local_agent", task_id: "agent", tool_use_id: "resume", description: "Coder", prompt: "Add textures" });
    child.receive({ type: "assistant", parent_tool_use_id: "launch", uuid: "one", message: { content: [{ type: "tool_use", id: "bash", name: "Bash", input: { command: "ls" } }] } });
    assert.deepEqual(events.filter(event => event.type.startsWith("subagent")).map(event => event.type === "subagent" ? event.runPrompt : event.event.callId), ["Add textures", "bash"]);
  });

  await t.test("Codex streams output, retains background terminals after turn end and stops polling when empty", async test => {
    test.mock.timers.enable({ apis: ["setTimeout"] });
    const events = [];
    const session = codexProvider.start({ ...options, emit: event => events.push(event) });
    sessions.push(session);
    const child = children.at(-1);
    const reply = async (method, result) => {
      const request = child.messages.findLast(message => message.method === method);
      assert.ok(request, method);
      child.receive({ id: request.id, result });
      await tick();
      return request;
    };
    await reply("initialize", {});
    await reply("thread/start", { thread: { id: "native-thread" } });
    session.send("Start server");
    await tick();
    await reply("turn/start", { turn: { id: "turn" } });
    child.receive({ method: "item/started", params: { item: { id: "bash", type: "commandExecution", command: "npm run dev", cwd: "/example", status: "inProgress" } } });
    child.receive({ method: "item/commandExecution/outputDelta", params: { itemId: "bash", delta: "Ready\n" } });
    assert.deepEqual(events.at(-1), { type: "tool.output", callId: "bash", output: "Ready\n", append: true });
    child.receive({ method: "item/completed", params: { item: { id: "bash", type: "commandExecution", command: "npm run dev", cwd: "/example", processId: "123", status: "completed", exitCode: null } } });
    assert.ok(events.some(event => event.type === "shell.background" && event.callId === "bash" && event.taskId === "123"));
    const discovery = child.messages.findLast(message => message.method === "thread/backgroundTerminals/list");
    child.receive({ id: discovery.id, error: { message: "Temporarily unavailable" } });
    await tick();
    const polls = child.messages.filter(message => message.method === "thread/backgroundTerminals/list").length;
    test.mock.timers.tick(1999);
    await tick();
    assert.equal(child.messages.filter(message => message.method === "thread/backgroundTerminals/list").length, polls);
    test.mock.timers.tick(1);
    await tick();
    assert.equal(child.messages.filter(message => message.method === "thread/backgroundTerminals/list").length, polls + 1);
    assert.equal(events.some(event => event.type === "exit" || event.type === "turn.end"), false);
    await reply("thread/backgroundTerminals/list", { data: [{ itemId: "bash", processId: "123", command: "npm run dev", cwd: "/example" }], nextCursor: null });
    assert.equal(events.at(-1).type, "shell.background");
    child.receive({ method: "turn/completed", params: { turn: { id: "turn", status: "completed" } } });
    await reply("thread/backgroundTerminals/list", { data: [{ itemId: "bash", processId: "123", command: "npm run dev", cwd: "/example" }], nextCursor: null });
    const toolEvents = events.filter(event => event.type.startsWith("tool.")).length;
    child.receive({ method: "item/completed", params: { item: { id: "bash", type: "commandExecution", command: "npm run dev", status: "completed" } } });
    assert.equal(events.filter(event => event.type.startsWith("tool.")).length, toolEvents);
    await reply("thread/backgroundTerminals/list", { data: [{ itemId: "bash", processId: "123", command: "npm run dev", cwd: "/example" }], nextCursor: null });
    const stopped = session.stopShell("123");
    const request = await reply("thread/backgroundTerminals/terminate", {});
    assert.deepEqual(request.params, { threadId: "native-thread", processId: "123" });
    await stopped;
    const count = child.messages.length;
    test.mock.timers.tick(6000);
    await tick();
    assert.equal(child.messages.length, count);
    child.receive({ method: "item/completed", params: { item: { id: "late-failure", type: "commandExecution", status: "failed", exitCode: 1, aggregatedOutput: "Server failed" } } });
    assert.deepEqual(events.at(-1), { type: "shell.end", callId: "late-failure", ok: false });
    assert.equal(events.some(event => event.type === "tool.start" && event.callId === "late-failure"), false);
    session.dispose();
  });
});
