import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "citropy-removed-provider-"));
process.env.CITROPY_DATA_DIR = directory;
const { EventJournal } = await import("../server/event-journal.ts");
const saved = new EventJournal(join(directory, "events.sqlite"));
saved.append({ t: "thread.upsert", thread: { id: "old", projectId: "project", title: "Old Pi chat", provider: "pi", model: "kimi", status: "idle", running: false, createdAt: 1, updatedAt: 1, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0, contextTokens: 0, contextMax: 0 } } });
saved.append({ t: "message.add", threadId: "old", message: { id: "m1", role: "user", ts: 1, parts: [{ id: "p1", kind: "text", text: "Hello", complete: true }] } });
saved.close();
const { store } = await import("../server/store.ts");
const { eventJournal } = await import("../server/event-journal.ts");

after(() => {
  store.flush();
  eventJournal.close();
  rmSync(directory, { recursive: true, force: true });
});

test("conversations from a removed agent stay readable and ask to be transferred", () => {
  const thread = store.threads.get("old");
  assert.equal(thread.status, "error");
  assert.match(thread.error, /Transfer it to another agent/);
  assert.equal(thread.messages[0].parts[0].text, "Hello");
});
