import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";

test("startup reads only legacy histories missing from the journal", async t => {
  const directory = fs.mkdtempSync(join(tmpdir(), "citropy-startup-"));
  process.env.CITROPY_DATA_DIR = directory;
  const { eventJournal } = await import("../server/event-journal.ts");
  const { emptyUsage } = await import("../shared/protocol.ts");
  const thread = id => ({ id, projectId: "project", provider: "opencode", title: id, createdAt: 1, updatedAt: 1, status: "idle", permissionMode: "manual", usage: emptyUsage(), running: false, messages: [{ id: `${id}-message`, role: "user", ts: 1, parts: [{ id: `${id}-part`, kind: "text", text: "Saved" }] }] });
  fs.mkdirSync(join(directory, "threads"));
  for (const id of ["saved", "deleted", "legacy"])
    fs.writeFileSync(join(directory, "threads", `${id}.json`), JSON.stringify(thread(id)));
  eventJournal.importThreads([thread("saved"), thread("deleted")]);
  eventJournal.append({ t: "part.append", threadId: "saved", messageId: "saved-message", partId: "saved-part", text: " newer text" });
  eventJournal.append({ t: "thread.remove", id: "deleted" });
  const readFileSync = fs.readFileSync;
  const reads = [];
  let store;
  t.after(() => {
    fs.readFileSync = readFileSync;
    syncBuiltinESMExports();
    store?.flush();
    eventJournal.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.readFileSync = function(path, ...args) {
    if (String(path).startsWith(join(directory, "threads"))) reads.push(String(path));
    return readFileSync.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  ({ store } = await import("../server/store.ts"));
  assert.deepEqual(reads, [join(directory, "threads", "legacy.json")]);
  assert.equal(store.threads.get("saved").messages[0].parts[0].text, "Saved newer text");
  assert.equal(store.threads.has("deleted"), false);
  assert.equal(store.threads.get("legacy").messages[0].parts[0].text, "Saved");
  assert.equal(eventJournal.hasThread("legacy"), true);
});
