import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";

const root = await mkdtemp(join(tmpdir(), "citropy-session-import-"));
process.env.CITROPY_DATA_DIR = join(root, "citropy");
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
process.env.CODEX_HOME = join(root, "codex");
process.env.XDG_DATA_HOME = join(root, "data");
await mkdir(process.env.CITROPY_DATA_DIR, { recursive: true });
const { store } = await import("../server/store.ts");
const { eventJournal } = await import("../server/event-journal.ts");
const { listImportableSessions, importSession } = await import("../server/session-import.ts");
const { providerLogUsage } = await import("../server/provider-log-usage.ts");
const { IMPORT_MAX_BYTES } = await import("../shared/session-import.ts");

after(async () => {
  store.flush();
  eventJournal.close();
  await rm(root, { recursive: true, force: true });
});

const at = "2026-09-20T10:00:00.000Z";
const line = (value) => `${JSON.stringify(value)}\n`;
const folder = async (name) => {
  const path = join(root, "work", name);
  await mkdir(path, { recursive: true });
  return path;
};
const claudeFile = async (name, sessionId, cwd, padding = "") => {
  const project = join(process.env.CLAUDE_CONFIG_DIR, "projects", "demo");
  await mkdir(project, { recursive: true });
  const header = line({ type: "user", sessionId, cwd, uuid: `${sessionId}-u`, timestamp: at, message: { role: "user", content: "Hello Claude" } })
    + line({ type: "assistant", sessionId, cwd, uuid: `${sessionId}-a`, timestamp: at, message: { role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: "Hello there" }] } });
  await writeFile(join(project, `${name}.jsonl`), padding ? Buffer.concat([Buffer.from(header), Buffer.from(padding)]) : header);
};
const listed = async (provider, sessionId) => (await listImportableSessions(provider)).find((session) => session.sessionId === sessionId);

test("imports a Claude session with its messages", async () => {
  const cwd = await folder("claude-basic");
  await claudeFile("basic", "claude-basic", cwd);
  const session = await listed("claude", "claude-basic");
  assert.equal(session.cwd, cwd);
  assert.equal(session.title, "Hello Claude");
  assert.equal(session.importedThreadId, undefined);
  const { threadId } = await importSession(session.id);
  const thread = store.threads.get(threadId);
  assert.equal(thread.externalId, "claude-basic");
  assert.deepEqual(thread.messages.map((message) => message.parts[0].text), ["Hello Claude", "Hello there"]);
});

test("reopens an imported session after its folder is deleted", async () => {
  const cwd = await folder("claude-deleted");
  await claudeFile("deleted", "claude-deleted", cwd);
  const first = await importSession((await listed("claude", "claude-deleted")).id);
  await rm(cwd, { recursive: true });
  const again = await listed("claude", "claude-deleted");
  assert.equal(again.importedThreadId, first.threadId);
  assert.deepEqual(await importSession(again.id), first);
});

test("imports a Codex session and captures its model", async () => {
  const cwd = await folder("codex-basic");
  const sessions = join(process.env.CODEX_HOME, "sessions", "2026", "09", "20");
  await mkdir(sessions, { recursive: true });
  await writeFile(join(sessions, "rollout-basic.jsonl"),
    line({ timestamp: at, type: "session_meta", payload: { id: "codex-basic", cwd } })
    + line({ timestamp: at, type: "turn_context", payload: { model: "gpt-5.5-codex" } })
    + line({ timestamp: at, type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Hello Codex" }] } })
    + line({ timestamp: at, type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello back" }] } }));
  const { threadId } = await importSession((await listed("codex", "codex-basic")).id);
  const thread = store.threads.get(threadId);
  assert.equal(thread.model, "gpt-5.5-codex");
  assert.deepEqual(thread.messages.map((message) => message.parts[0].text), ["Hello Codex", "Hello back"]);
});

test("refuses to import a session above the size limit", async () => {
  const cwd = await folder("claude-large");
  await claudeFile("large", "claude-large", cwd, " ".repeat(IMPORT_MAX_BYTES));
  const session = await listed("claude", "claude-large");
  await assert.rejects(importSession(session.id), /exceeds the 32 MB import limit/);
});

test("lists and imports OpenCode sessions from the shared database", async () => {
  const cwd = await folder("opencode-basic");
  const database = join(process.env.XDG_DATA_HOME, "opencode", "opencode.db");
  await mkdir(join(process.env.XDG_DATA_HOME, "opencode"), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec("CREATE TABLE session (id TEXT, directory TEXT, title TEXT, model TEXT, time_updated INTEGER, parent_id TEXT)");
  db.exec("CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)");
  db.exec("CREATE TABLE part (id TEXT, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT)");
  const created = Date.parse(at);
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, NULL)").run("oc-basic", cwd, "OpenCode chat", JSON.stringify({ providerID: "anthropic", id: "claude-opus-5" }), created);
  const message = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)");
  const part = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?)");
  message.run("m1", "oc-basic", created, JSON.stringify({ role: "user", time: { created } }));
  part.run("p1", "m1", "oc-basic", created, JSON.stringify({ type: "text", text: "Hello OpenCode" }));
  message.run("m2", "oc-basic", created + 1, JSON.stringify({ role: "assistant", providerID: "anthropic", modelID: "claude-opus-5", time: { created: created + 1 }, tokens: { input: 7, output: 3, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0 }));
  part.run("p2", "m2", "oc-basic", created + 1, JSON.stringify({ type: "text", text: "Hello from OpenCode" }));
  db.close();
  const session = await listed("opencode", "oc-basic");
  assert.equal(session.title, "OpenCode chat");
  assert.equal(session.cwd, cwd);
  const { threadId } = await importSession(session.id);
  const thread = store.threads.get(threadId);
  assert.equal(thread.model, "anthropic/claude-opus-5");
  assert.deepEqual(thread.messages.map((entry) => entry.parts[0].text), ["Hello OpenCode", "Hello from OpenCode"]);
  const usage = (await providerLogUsage()).filter((entry) => entry.provider === "opencode");
  assert.equal(usage.reduce((sum, entry) => sum + entry.input, 0), 7);
});
