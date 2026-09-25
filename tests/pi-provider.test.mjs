import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

async function waitFor(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Pi did not reach the expected state");
}

test("Pi maps RPC events and routes tool approval through the app", async t => {
  const root = await mkdtemp(join(tmpdir(), "citropy-pi-"));
  const binary = join(root, "pi");
  const log = join(root, "commands.jsonl");
  const old = { ...process.env };
  process.env.CITROPY_DATA_DIR = join(root, "data");
  process.env.FAKE_PI_LOG = log;
  process.env.PATH = `${root}:${process.env.PATH}`;
  await writeFile(binary, `#!${process.execPath}
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { process.stdout.write("1.0.0\\n"); process.exit(0); }
appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ type: "startup", args: process.argv.slice(2), mcpUrl: process.env.CITROPY_PI_MCP_URL, mcpAuthorization: process.env.CITROPY_PI_MCP_AUTHORIZATION, tools: JSON.parse(process.env.CITROPY_PI_TOOLS || "[]").map(tool => tool.name) }) + "\\n");
let buffer = "";
const send = value => process.stdout.write(JSON.stringify(value) + "\\n");
process.stdin.on("data", chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const raw = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    const row = JSON.parse(raw);
    appendFileSync(process.env.FAKE_PI_LOG, raw + "\\n");
    if (row.type === "get_state") send({ id: row.id, type: "response", command: row.type, success: true, data: { sessionId: "pi-native", model: { provider: "openai", id: "test", contextWindow: 8000 }, thinkingLevel: "medium" } });
    if (row.type === "get_available_models") send({ id: row.id, type: "response", command: row.type, success: true, data: { models: [{ provider: "openai", id: "test", name: "Test model", contextWindow: 8000, reasoning: true }] } });
    if (row.type === "prompt") {
      send({ id: row.id, type: "response", command: row.type, success: true });
      send({ type: "agent_start" });
      send({ type: "message_start", message: { role: "assistant" } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_end", contentIndex: 0 } });
      send({ type: "extension_ui_request", method: "confirm", id: "approval", title: "bash", message: JSON.stringify({ command: "ls" }) });
    }
    if (row.type === "extension_ui_response") {
      send({ type: "tool_execution_start", toolCallId: "call", toolName: "bash", args: { command: "ls" } });
      send({ type: "tool_execution_end", toolCallId: "call", toolName: "bash", result: { content: [{ type: "text", text: "files" }] }, isError: !row.confirmed });
      send({ type: "message_end", message: { role: "assistant", responseId: "response", usage: { input: 10, output: 4, cacheRead: 1, cacheWrite: 0, cost: { total: 0.01 } } } });
      send({ type: "agent_settled" });
    }
  }
});
`, { mode: 0o755 });
  await chmod(binary, 0o755);
  const { piProvider } = await import("../server/providers/pi.ts");
  const { store } = await import("../server/store.ts");
  const { pendingRequests, answer } = await import("../server/permissions.ts");
  const project = store.openProject(root);
  const thread = store.createThread({ projectId: project.id, provider: "pi", title: "Pi check", permissionMode: "manual" });
  const events = [];
  const session = piProvider.start({ threadId: thread.id, cwd: root, model: "openai/test", permissionMode: "manual", mcp: { url: "http://127.0.0.1:1234/mcp/test", headers: { Authorization: "Bearer secret" } }, emit: event => events.push(event) });
  t.after(async () => { session.dispose(); process.env = old; await rm(root, { recursive: true, force: true }); });
  assert.deepEqual(await piProvider.detect(), { available: true, version: "1.0.0" });
  assert.deepEqual((await piProvider.listModels()).map(model => [model.id, model.hint, model.isDefault]), [["openai/test", "openai", true]]);
  await waitFor(() => events.find(event => event.type === "session"));
  await session.send("hello");
  const request = await waitFor(() => pendingRequests().find(request => request.threadId === thread.id));
  assert.equal(request.tool, "Bash");
  assert.deepEqual(request.input, { command: "ls" });
  answer(request.id, "allow");
  await waitFor(() => events.some(event => event.type === "turn.end"));
  assert.equal(events.find(event => event.type === "block.delta").text, "Hello");
  assert.equal(events.find(event => event.type === "tool.end").output, "files");
  assert.equal(events.find(event => event.type === "usage").usage.input, 10);
  const commands = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const startup = commands.find(command => command.type === "startup");
  assert.ok(startup.args.includes("--extension"));
  assert.ok(startup.args.some(arg => arg.endsWith("pi-tools.mjs")));
  assert.equal(startup.mcpUrl, "http://127.0.0.1:1234/mcp/test");
  assert.equal(startup.mcpAuthorization, "Bearer secret");
  assert.deepEqual(startup.tools, ["ask_user", "tool_help", "run_tool"]);
  assert.equal(commands.find(command => command.type === "extension_ui_response").confirmed, true);
  assert.equal(commands.find(command => command.type === "prompt").message, "hello");
});

test("Pi permission extension blocks changes in plan mode and asks in manual mode", async () => {
  const { default: approval } = await import("../server/providers/pi-approval.mjs");
  let handler;
  approval({ on: (_event, callback) => { handler = callback; } });
  const previous = process.env.CITROPY_PI_PERMISSION_MODE;
  try {
    process.env.CITROPY_PI_PERMISSION_MODE = "plan";
    assert.equal((await handler({ toolName: "bash", input: { command: "ls" } }, {})).block, true);
    assert.equal(await handler({ toolName: "read", input: { path: "file" } }, {}), undefined);
    process.env.CITROPY_PI_PERMISSION_MODE = "manual";
    const calls = [];
    const ctx = { ui: { confirm: async (...args) => { calls.push(args); return false; } } };
    assert.equal((await handler({ toolName: "write", input: { path: "file" } }, ctx)).block, true);
    assert.deepEqual(calls[0], ["write", JSON.stringify({ path: "file" })]);
    process.env.CITROPY_PI_PERMISSION_MODE = "acceptEdits";
    assert.equal(await handler({ toolName: "edit", input: {} }, ctx), undefined);
    process.env.CITROPY_PI_PERMISSION_MODE = "bypass";
    assert.equal(await handler({ toolName: "bash", input: {} }, ctx), undefined);
    process.env.CITROPY_PI_PERMISSION_MODE = "plan";
    assert.equal(await handler({ toolName: "run_tool", input: {} }, ctx), undefined);
  } finally {
    if (previous === undefined) delete process.env.CITROPY_PI_PERMISSION_MODE;
    else process.env.CITROPY_PI_PERMISSION_MODE = previous;
  }
});

test("Pi exposes Citropy tools through its authenticated MCP extension", async t => {
  const { default: extension } = await import("../server/providers/pi-tools.mjs");
  const { workspaceTools, discoveryTools } = await import("../server/mcp-catalog.ts");
  const received = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ authorization: request.headers.authorization, body: JSON.parse(body) });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "done" }, { type: "image", mimeType: "image/png", data: "aGVsbG8=" }], isError: false } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const previous = Object.fromEntries(["CITROPY_PI_MCP_URL", "CITROPY_PI_MCP_AUTHORIZATION", "CITROPY_PI_TOOLS"].map(key => [key, process.env[key]]));
  process.env.CITROPY_PI_MCP_URL = `http://127.0.0.1:${server.address().port}/mcp/test`;
  process.env.CITROPY_PI_MCP_AUTHORIZATION = "Bearer secret";
  process.env.CITROPY_PI_TOOLS = JSON.stringify([workspaceTools.find(tool => tool.name === "ask_user"), ...discoveryTools]);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const tools = [];
  extension({ registerTool: tool => tools.push(tool) });
  assert.deepEqual(tools.map(tool => tool.name), ["ask_user", "tool_help", "run_tool"]);
  assert.deepEqual(tools.find(tool => tool.name === "run_tool").parameters.required, ["name", "arguments"]);
  const result = await tools.find(tool => tool.name === "run_tool").execute("call", { name: "browser_tabs", arguments: {} }, new AbortController().signal);
  assert.equal(received[0].authorization, "Bearer secret");
  assert.deepEqual(received[0].body.params, { name: "run_tool", arguments: { name: "browser_tabs", arguments: {} } });
  assert.deepEqual(result.content.map(part => part.type), ["text", "image"]);
});
