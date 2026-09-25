import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

async function until(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Codex did not reach the expected state");
}

test("Codex refreshes MCP tools and answers app-access elicitations", async t => {
  const originalSpawn = childProcess.spawn;
  let child;
  childProcess.spawn = () => {
    child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.messages = [];
    child.stdin.on("data", data => child.messages.push(JSON.parse(String(data))));
    child.receive = value => child.stdout.write(`${JSON.stringify(value)}\n`);
    child.kill = () => true;
    return child;
  };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const { codexProvider } = await import("../server/providers/codex.ts");
  const { pendingRequests, answer } = await import("../server/permissions.ts");
  const session = codexProvider.start({ threadId: "fixture", cwd: process.cwd(), permissionMode: "manual", mcp: { url: "http://127.0.0.1:9/mcp", headers: { Authorization: "Bearer test" } }, emit: () => {} });
  t.after(() => session.dispose());
  session.send("hello");
  await until(() => child.messages.some(message => message.method === "initialize"));
  child.receive({ id: child.messages.find(message => message.method === "initialize").id, result: {} });
  await until(() => child.messages.some(message => message.method === "thread/start"));
  child.receive({ id: child.messages.find(message => message.method === "thread/start").id, result: { thread: { id: "native-thread" } } });
  await until(() => child.messages.some(message => message.method === "config/mcpServer/reload"));
  assert.equal(child.messages.some(message => message.method === "turn/start"), false);
  child.receive({ id: child.messages.find(message => message.method === "config/mcpServer/reload").id, result: {} });
  await until(() => child.messages.some(message => message.method === "turn/start"));
  child.receive({ id: child.messages.find(message => message.method === "turn/start").id, result: { turn: { id: "turn-1" } } });
  child.receive({ id: "access", method: "mcpServer/elicitation/request", params: { threadId: "native-thread", serverName: "computer-use", mode: "form", message: "Allow access to Safari?", _meta: { app_name: "Safari" }, requestedSchema: { type: "object", properties: { scope: { type: "string", enum: ["once", "always"] } }, required: ["scope"] } } });
  const request = await until(() => pendingRequests().find(entry => entry.threadId === "fixture"));
  assert.match(request.tool, /Safari/);
  answer(request.id, "allow");
  await until(() => child.messages.some(message => message.id === "access"));
  assert.deepEqual(child.messages.find(message => message.id === "access").result, { action: "accept", content: { scope: "once" } });
  child.receive({ id: "url", method: "mcpServer/elicitation/request", params: { threadId: "native-thread", serverName: "external", mode: "url", message: "Open a URL", url: "https://example.com" } });
  await until(() => child.messages.some(message => message.id === "url"));
  assert.deepEqual(child.messages.find(message => message.id === "url").result, { action: "decline" });
  child.receive({ id: "persistent", method: "mcpServer/elicitation/request", params: { threadId: "native-thread", mode: "form", requestedSchema: { type: "object", properties: { scope: { type: "string", default: "always" } }, required: ["scope"] } } });
  await until(() => child.messages.some(message => message.id === "persistent"));
  assert.deepEqual(child.messages.find(message => message.id === "persistent").result, { action: "decline" });
});
