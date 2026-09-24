import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = await mkdtemp(join(tmpdir(), "citropy-store-persistence-"));
process.env.CITROPY_DATA_DIR = join(root, "data");
const { store, Store } = await import("../server/store.ts");

test("thread changes survive a restart without writing per-thread files", async (t) => {
  t.after(async () => {
    store.flush();
    await rm(root, { recursive: true, force: true });
  });

  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const project = store.openProject(workspace);
  const thread = store.createThread({ projectId: project.id, provider: "opencode", title: "Persistence", permissionMode: "manual" });
  const message = store.addMessage(thread.id, { id: "m1", role: "assistant", ts: Date.now(), parts: [{ id: "p1", kind: "text", text: "streaming" }] });
  store.appendText(thread.id, message.id, "p1", " more text");

  assert.equal(new Store().threads.get(thread.id).messages[0].parts[0].text, "streaming more text");
  store.flush();
  assert.equal(existsSync(join(root, "data", "threads", `${thread.id}.json`)), false);

  await t.test("live updates avoid scanning old history and older parts remain editable", () => {
    const entry = store.createThread({ projectId: project.id, provider: "opencode", title: "Long history", permissionMode: "manual" });
    const messages = Array.from({ length: 1000 }, (_, index) => ({
      id: `history-message-${index}`, role: "assistant", ts: index,
      parts: [{ id: `history-part-${index}`, kind: "text", text: "History" }],
    }));
    const current = messages.at(-1);
    current.parts = Array.from({ length: 1000 }, (_, index) => ({ id: `current-part-${index}`, kind: "text", text: "" }));
    store.replaceMessages(entry.id, messages);
    let inspectedIds = 0;
    for (const value of [...messages, ...current.parts]) {
      const id = value.id;
      Object.defineProperty(value, "id", { enumerable: true, get() { inspectedIds++; return id; } });
    }
    for (let index = 0; index < 50; index++) store.appendText(entry.id, "history-message-999", "current-part-999", "delta ");
    store.patchPart(entry.id, "history-message-999", "current-part-999", { complete: true });
    assert.ok(inspectedIds <= 102, `${inspectedIds} IDs inspected for 51 live updates`);
    assert.equal(current.parts.at(-1).text, "delta ".repeat(50));
    assert.equal(current.parts.at(-1).complete, true);
    store.patchPart(entry.id, "history-message-0", "history-part-0", { text: "Updated older message" });
    assert.equal(messages[0].parts[0].text, "Updated older message");
    store.patchPart(entry.id, "history-message-999", "current-part-0", { text: "Updated older part" });
    assert.equal(current.parts[0].text, "Updated older part");
    assert.throws(() => store.appendText(entry.id, "missing-message", "missing-part", "delta"), /unknown message/);
    assert.throws(() => store.appendText(entry.id, "history-message-999", "missing-part", "delta"), /unknown part/);
    const recovered = new Store().threads.get(entry.id);
    assert.equal(recovered.messages[0].parts[0].text, "Updated older message");
    assert.equal(recovered.messages.at(-1).parts.at(-1).text, "delta ".repeat(50));
  });

  await t.test("metadata reuses file counts during streaming and invalidates actual file changes", () => {
    const entry = store.createThread({ projectId: project.id, provider: "opencode", title: "Metadata", permissionMode: "manual" });
    const tool = { id: "edit-part", kind: "tool", callId: "edit", name: "Edit", shape: "edit", status: "ok", input: { file_path: "first.ts" } };
    store.addMessage(entry.id, { id: "edits", role: "assistant", ts: 1, parts: [tool] });
    store.addPart(entry.id, "edits", { id: "answer", kind: "text", text: "" });
    assert.equal(store.meta(entry).changedFiles, 1);
    let scans = 0;
    Object.defineProperty(tool, "input", { enumerable: true, configurable: true, get() { scans++; return { file_path: "first.ts" }; } });
    for (let index = 0; index < 50; index++) {
      store.appendText(entry.id, "edits", "answer", "delta");
      store.patchThread(entry.id, { status: "working" });
      assert.equal(store.meta(entry).changedFiles, 1);
    }
    assert.equal(scans, 0);
    Object.defineProperty(tool, "input", { enumerable: true, configurable: true, writable: true, value: { file_path: "first.ts" } });
    store.patchPart(entry.id, "edits", "edit-part", { input: { paths: ["first.ts", "second.ts", "first.ts"] } });
    assert.equal(store.meta(entry).changedFiles, 2);
    store.patchPart(entry.id, "edits", "edit-part", { status: "error" });
    assert.equal(store.meta(entry).changedFiles, 0);
    store.addPart(entry.id, "edits", { ...tool, id: "write-part", shape: "write", status: "ok", input: { path: "third.ts" } });
    assert.equal(store.meta(entry).changedFiles, 1);
    store.addMessage(entry.id, { id: "next-edits", role: "assistant", ts: 2, parts: [{ ...tool, id: "next-edit", status: "ok" }] });
    assert.equal(store.meta(entry).changedFiles, 3);
    store.replaceMessages(entry.id, []);
    assert.equal(store.meta(entry).changedFiles, 0);
  });
});
