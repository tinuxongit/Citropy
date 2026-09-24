import { createServer } from "node:http";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("provider sessions import history, resume IDs, and original workspaces without modifying source files", async t => {
  const root = await mkdtemp(join(tmpdir(), "citropy-import-"));
  const old = { ...process.env };
  process.env.CITROPY_DATA_DIR = join(root, "citropy");
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.CODEX_HOME = join(root, "codex");
  t.after(async () => { process.env = old; await rm(root, { recursive: true, force: true }); });
  const cwd = join(root, "workspace");
  await mkdir(cwd);
  const claude = join(root, "claude/projects/project/session.jsonl");
  const codex = join(root, "codex/sessions/2026/09/24/rollout.jsonl");
  const stamp = "2026-09-24T06:00:00Z";
  const rows = [
    { type: "user", uuid: "u1", sessionId: "claude-session", cwd, timestamp: stamp, message: { role: "user", content: "Build a game" } },
    { type: "assistant", uuid: "a1", timestamp: stamp, message: { role: "assistant", model: "claude-test", content: [{ type: "text", text: "Reading files" }, { type: "tool_use", id: "call1", name: "Read", input: { path: "game.js" } }] } },
    { type: "user", uuid: "u2", timestamp: stamp, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "call1", content: "const game = true;" }] } },
  ];
  await mkdir(join(root, "claude/projects/project"), { recursive: true });
  await writeFile(claude, rows.map(row => JSON.stringify(row)).join("\n"));
  await mkdir(join(root, "codex/sessions/2026/09/24"), { recursive: true });
  await writeFile(codex, [
    { type: "session_meta", payload: { id: "codex-session", cwd } },
    { type: "turn_context", payload: { model: "codex-test" } },
    { type: "response_item", timestamp: stamp, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Fix the game" }] } },
    { type: "response_item", timestamp: stamp, payload: { type: "function_call", call_id: "c1", name: "exec_command", arguments: '{"cmd":"ls"}' } },
    { type: "response_item", timestamp: stamp, payload: { type: "function_call_output", call_id: "c1", output: "game.js" } },
    { type: "response_item", timestamp: stamp, payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Fixed it" }] } },
  ].map(row => JSON.stringify(row)).join("\n") + "\n{partial");
  const { listImportableSessions, importSession } = await import("../server/session-import.ts");
  const { store } = await import("../server/store.ts");
  const original = await readFile(claude, "utf8");
  const list = await listImportableSessions("claude");
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "Build a game");
  const imported = await importSession(list[0].id);
  const thread = store.threads.get(imported.threadId);
  assert.equal(thread.externalId, "claude-session");
  assert.equal(thread.permissionMode, "manual");
  assert.equal(store.projects.get(imported.projectId).path, cwd);
  assert.equal(thread.messages.length, 2);
  assert.equal(thread.messages[1].parts[1].output, "const game = true;");
  assert.equal(await readFile(claude, "utf8"), original);
  assert.deepEqual(await importSession(list[0].id), imported);
  assert.equal((await listImportableSessions("claude"))[0].importedThreadId, imported.threadId);
  const codexList = await listImportableSessions("codex");
  const result = await importSession(codexList[0].id);
  const conversation = store.threads.get(result.threadId);
  assert.equal(conversation.model, "codex-test");
  assert.equal(conversation.externalId, "codex-session");
  assert.equal(conversation.messages[1].parts[0].output, "game.js");
  assert.equal(conversation.messages[2].parts[0].text, "Fixed it");
  assert.equal(store.threads.size, 2);
  await assert.rejects(importSession("../../outside"), /Refresh/);
  await assert.rejects(listImportableSessions("unknown"), /Choose/);
  const { handleFeatures } = await import("../server/features.ts");
  const server = createServer((req, res) => { void handleFeatures(req, res, []).then(handled => { if (!handled) res.writeHead(404).end(); }); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/providers/sessions`;
  const response = await fetch(`${url}?provider=codex`);
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].importedThreadId, result.threadId);
  const denied = await fetch(url, { method: "POST", headers: { origin: "https://untrusted.example" }, body: JSON.stringify({ id: codexList[0].id }) });
  assert.equal(denied.status, 403);
  const opened = await fetch(url, { method: "POST", body: JSON.stringify({ id: codexList[0].id }) });
  assert.deepEqual(await opened.json(), result);
  const outside = join(root, "outside.jsonl");
  await writeFile(outside, original);
  await rm(claude);
  await symlink(outside, claude);
  await assert.rejects(importSession(list[0].id), /outside/);
  assert.equal((await listImportableSessions("claude")).length, 0);
});
