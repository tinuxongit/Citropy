import { createServer } from "node:http";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

test("provider sessions import history, resume IDs, and original workspaces without modifying source files", async t => {
  const root = await mkdtemp(join(tmpdir(), "citropy-import-"));
  const old = { ...process.env };
  process.env.CITROPY_DATA_DIR = join(root, "citropy");
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.CODEX_HOME = join(root, "codex");
  process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "pi/sessions");
  process.env.XDG_DATA_HOME = join(root, "share");
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
  const bin = join(root, "bin");
  await mkdir(bin);
  const agent = fileURLToPath(new URL("./fixtures/fake-acp-agent.mjs", import.meta.url));
  await writeFile(join(bin, "cursor-agent"), `#!/bin/sh\nexec node '${agent}' "$@"\n`, { mode: 0o755 });
  process.env.PATH = `${bin}:${old.PATH}`;
  process.env.FAKE_ACP_IMPORT = "1";
  process.env.FAKE_ACP_CWD = cwd;
  const cursorList = await listImportableSessions("cursor");
  assert.equal(cursorList.length, 1);
  assert.equal(cursorList[0].cwd, cwd);
  const cursorResult = await importSession(cursorList[0].id);
  const cursorThread = store.threads.get(cursorResult.threadId);
  assert.equal(cursorThread.externalId, "cursor-import-session");
  assert.equal(cursorThread.title, "Cursor game");
  assert.equal(cursorThread.model, "fake-fast");
  assert.deepEqual(cursorThread.messages.map(message => message.role), ["user", "assistant"]);
  assert.equal(cursorThread.messages[1].parts.find(part => part.kind === "tool").output, "const game = true;");
  assert.equal(cursorThread.messages[1].parts.at(-1).text, "Looks good");
  assert.deepEqual(await importSession(cursorList[0].id), cursorResult);
  assert.equal((await listImportableSessions("cursor"))[0].importedThreadId, cursorResult.threadId);
  await writeFile(join(bin, "cursor-agent"), "#!/bin/sh\nexit 7\n", { mode: 0o755 });
  await assert.rejects(listImportableSessions("cursor"));
  delete process.env.FAKE_ACP_IMPORT;
  delete process.env.FAKE_ACP_CWD;
  process.env.PATH = old.PATH;
  const pi = join(root, "pi/sessions/project/pi-session.jsonl");
  await mkdir(join(root, "pi/sessions/project"), { recursive: true });
  await writeFile(pi, [
    { type: "session", version: 3, id: "pi-session", cwd, timestamp: stamp },
    { type: "message", id: "pi-user", parentId: null, timestamp: stamp, message: { role: "user", content: [{ type: "text", text: "Make a Pi game" }], timestamp: Date.parse(stamp) } },
    { type: "message", id: "abandoned", parentId: "pi-user", timestamp: stamp, message: { role: "assistant", content: [{ type: "text", text: "Old branch" }] } },
    { type: "model_change", id: "pi-model", parentId: "pi-user", provider: "openai", modelId: "gpt-test", timestamp: stamp },
    { type: "message", id: "pi-assistant", parentId: "pi-model", timestamp: stamp, message: { role: "assistant", provider: "openai", model: "gpt-test", content: [{ type: "text", text: "Building" }, { type: "toolCall", id: "pi-tool", name: "read", arguments: { path: "game.js" } }] } },
    { type: "message", id: "pi-result", parentId: "pi-assistant", timestamp: stamp, message: { role: "toolResult", toolCallId: "pi-tool", content: [{ type: "text", text: "game.js" }] } },
    { type: "session_info", id: "pi-name", parentId: "pi-result", timestamp: stamp, name: "Named Pi session" },
  ].map(row => JSON.stringify(row)).join("\n"));
  const piList = await listImportableSessions("pi");
  assert.equal(piList.length, 1);
  assert.equal(piList[0].title, "Named Pi session");
  const piResult = await importSession(piList[0].id);
  const piThread = store.threads.get(piResult.threadId);
  assert.equal(piThread.model, "openai/gpt-test");
  assert.equal(piThread.messages.length, 2);
  assert.equal(piThread.messages[1].parts[1].output, "game.js");
  const dbPath = join(root, "share/opencode/opencode.db");
  await mkdir(join(root, "share/opencode"), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT, model TEXT, time_updated INTEGER, parent_id TEXT); CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER); CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER)");
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)").run("opencode-session", cwd, "OpenCode game", JSON.stringify({ providerID: "openai", id: "gpt-test" }), Date.parse(stamp), null);
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)").run("oc-user", "opencode-session", JSON.stringify({ role: "user", time: { created: Date.parse(stamp) } }), 1);
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)").run("oc-assistant", "opencode-session", JSON.stringify({ role: "assistant", providerID: "openai", modelID: "gpt-test" }), 2);
  db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run("oc-part-user", "oc-user", "opencode-session", JSON.stringify({ type: "text", text: "Open the game" }), 1);
  db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run("oc-part-assistant", "oc-assistant", "opencode-session", JSON.stringify({ type: "tool", tool: "read", callID: "oc-tool", state: { status: "completed", input: { path: "game.js" }, output: "game.js" } }), 2);
  db.close();
  const openCodeList = await listImportableSessions("opencode");
  assert.equal(openCodeList.length, 1);
  const openCodeResult = await importSession(openCodeList[0].id);
  assert.equal(store.threads.get(openCodeResult.threadId).messages[1].parts[0].output, "game.js");
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
