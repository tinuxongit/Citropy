import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventJournal, eventJournal, pageMessages } from "../server/event-journal.ts";
import { store } from "../server/store.ts";
import { threadRoutes } from "../server/routes/threads.ts";

function message(index, text = `Message ${index}`) {
  return { id: `message-${index}`, role: "assistant", ts: index, parts: [{ id: `part-${index}`, kind: "text", text, complete: true }] };
}

function fixture(t, count = 200) {
  const journal = new EventJournal(":memory:");
  t.after(() => journal.close());
  journal.append({ t: "thread.upsert", thread: { id: "chat" } });
  for (let index = 0; index < count; index++) journal.append({ t: "message.add", threadId: "chat", message: message(index) });
  return journal;
}

test("history pages traverse stable positions without materializing the full transcript", t => {
  const journal = fixture(t);
  t.mock.method(journal, "messages", () => { throw new Error("Full history must not be loaded"); });
  const latest = journal.messagePage("chat");
  assert.equal(latest.messages.length, 80);
  assert.equal(latest.messages[0].id, "message-120");
  assert.equal(latest.messages.at(-1).id, "message-199");
  assert.deepEqual(latest.page, { next: "message-120", revision: 0 });
  journal.append({ t: "message.add", threadId: "chat", message: message(200) });
  journal.append({ t: "part.append", threadId: "chat", messageId: "message-119", partId: "part-119", text: " live" });
  const older = journal.messagePage("chat", { before: latest.page.next, revision: latest.page.revision });
  assert.equal(older.messages.length, 80);
  assert.equal(older.messages[0].id, "message-40");
  assert.equal(older.messages.at(-1).parts[0].text, "Message 119 live");
  assert.deepEqual(older.page, { before: "message-120", next: "message-40", revision: 0 });
  const oldest = journal.messagePage("chat", { before: older.page.next, revision: older.page.revision });
  assert.equal(oldest.messages.length, 40);
  assert.deepEqual(oldest.page, { before: "message-40", revision: 0 });
  assert.deepEqual([...oldest.messages, ...older.messages, ...latest.messages].map(entry => entry.id), Array.from({ length: 200 }, (_, index) => `message-${index}`));
});

test("history pages reset stale or unversioned cursors after full replacement", t => {
  const journal = fixture(t);
  const latest = journal.messagePage("chat");
  const replacement = Array.from({ length: 110 }, (_, index) => message(index));
  const revision = journal.append({ t: "thread.messages", threadId: "chat", messages: replacement });
  const fresh = journal.messagePage("chat", { before: latest.page.next, revision: latest.page.revision });
  assert.equal(fresh.messages[0].id, "message-30");
  assert.equal(fresh.messages.at(-1).id, "message-109");
  assert.deepEqual(fresh.page, { next: "message-30", revision });
  assert.deepEqual(journal.messagePage("chat", { before: fresh.page.next }), fresh);
  const older = journal.messagePage("chat", { before: fresh.page.next, revision });
  assert.equal(older.messages.length, 30);
  assert.deepEqual(older.page, { before: "message-30", revision });
  const emptyRevision = journal.append({ t: "thread.messages", threadId: "chat", messages: [] });
  assert.deepEqual(journal.messagePage("chat", { before: older.page.before, revision }), { messages: [], page: { revision: emptyRevision } });
});

test("history cursors are scoped to their existing thread and validate page values", t => {
  const journal = fixture(t, 3);
  journal.append({ t: "thread.upsert", thread: { id: "other" } });
  journal.append({ t: "message.add", threadId: "other", message: message("other") });
  assert.throws(() => journal.messagePage("chat", { before: "message-other", revision: 0 }), /cursor/);
  assert.throws(() => journal.messagePage("chat", { before: "missing", revision: 0 }), /cursor/);
  for (const page of [null, [], { before: "" }, { before: 4 }, { revision: -1 }, { revision: 1.5 }, { revision: Number.POSITIVE_INFINITY }])
    assert.throws(() => journal.messagePage("chat", page), /Invalid/);
  assert.throws(() => journal.messagePage("missing"), /no longer exists/);
  journal.append({ t: "thread.remove", id: "chat" });
  assert.throws(() => journal.messagePage("chat"), /no longer exists/);
});

test("history byte limits include deltas and keep one oversized message intact", t => {
  const journal = fixture(t, 0);
  for (let index = 0; index < 6; index++) journal.append({ t: "message.add", threadId: "chat", message: message(index, "x".repeat(400_000)) });
  const latest = journal.messagePage("chat");
  assert.deepEqual(latest.messages.map(entry => entry.id), ["message-4", "message-5"]);
  assert.deepEqual(latest.page, { next: "message-4", revision: 0 });
  journal.append({ t: "message.add", threadId: "chat", message: message(6, "") });
  const text = "🙂\n\"".repeat(300_000);
  journal.append({ t: "part.append", threadId: "chat", messageId: "message-6", partId: "part-6", text });
  const oversized = journal.messagePage("chat");
  assert.equal(oversized.messages.length, 1);
  assert.equal(oversized.messages[0].parts[0].text, text);
  assert.deepEqual(oversized.page, { next: "message-6", revision: 0 });
  assert.deepEqual(journal.messagePage("chat", { before: oversized.page.next, revision: 0 }).messages.map(entry => entry.id), ["message-4", "message-5"]);
});

test("page budgets count combined text rather than the number of retained chunks", t => {
  const journal = fixture(t, 0);
  journal.append({ t: "message.add", threadId: "chat", message: message(0, "a".repeat(523_800)) });
  for (let index = 0; index < 200; index++) journal.append({ t: "part.append", threadId: "chat", messageId: "message-0", partId: "part-0", text: "x" });
  journal.append({ t: "message.add", threadId: "chat", message: message(1, "b".repeat(524_000)) });
  const page = journal.messagePage("chat");
  assert.deepEqual(page.messages.map(entry => entry.id), ["message-0", "message-1"]);
  assert.equal(page.messages[0].parts[0].text, "a".repeat(523_800) + "x".repeat(200));
  assert.ok(Buffer.byteLength(JSON.stringify(page.messages)) < 1024 * 1024);
  assert.deepEqual(page.page, { revision: 0 });
});

test("oversized older retained deltas are skipped before JSON hydration", t => {
  const journal = fixture(t, 0);
  journal.append({ t: "message.add", threadId: "chat", message: message(0, "") });
  const text = "x".repeat(8 * 1024 * 1024);
  journal.append({ t: "part.append", threadId: "chat", messageId: "message-0", partId: "part-0", text });
  journal.append({ t: "message.add", threadId: "chat", message: message(1) });
  const parse = JSON.parse;
  t.mock.method(JSON, "parse", (...args) => {
    assert.ok(args[0].length < 1024 * 1024);
    return parse(...args);
  });
  const page = journal.messagePage("chat");
  assert.deepEqual(page.messages, [message(1)]);
  assert.deepEqual(page.page, { next: "message-1", revision: 0 });
  t.mock.restoreAll();
  const older = journal.messagePage("chat", { before: page.page.next, revision: 0 });
  assert.equal(older.messages.length, 1);
  assert.equal(older.messages[0].parts[0].text, text);
});

test("paged reads preserve empty messages, mixed parts and interleaved Unicode deltas after reopen", t => {
  const thread = store.createThread({ projectId: store.openProject(process.cwd()).id, provider: "claude" });
  t.after(() => store.removeThread(thread.id));
  const entries = [
    { id: "empty-page-message", role: "user", ts: 1, parts: [] },
    { id: "mixed-page-message", role: "assistant", ts: 2, parts: [
      { id: "reason-page-part", kind: "reasoning", text: "Thinking " },
      { id: "tool-page-part", kind: "tool", callId: "call", name: "Read", shape: "read", headline: "file", input: {}, status: "ok", output: "Kept", startedAt: 2 },
      { id: "text-page-part", kind: "text", text: "Answer " },
    ] },
  ];
  store.replaceMessages(thread.id, entries);
  const expected = structuredClone(entries);
  for (const [partId, text] of [["text-page-part", "🙂\n"], ["reason-page-part", '"A"'], ["text-page-part", "\0B"], ["reason-page-part", "C"]]) {
    eventJournal.append({ t: "part.append", threadId: thread.id, messageId: "mixed-page-message", partId, text });
    expected[1].parts.find(part => part.id === partId).text += text;
  }
  const before = eventJournal.messagePage(thread.id);
  assert.deepEqual(before.messages, expected);
  eventJournal.close();
  assert.deepEqual(eventJournal.messagePage(thread.id), before);
});

test("replacement history revisions survive journal reopen", t => {
  const thread = store.createThread({ projectId: store.openProject(process.cwd()).id, provider: "claude" });
  t.after(() => store.removeThread(thread.id));
  const revision = eventJournal.append({ t: "thread.messages", threadId: thread.id, messages: [message("reopened")] });
  eventJournal.close();
  assert.deepEqual(eventJournal.messagePage(thread.id).page, { revision });
});

test("paged route replies echo request IDs and legacy clients retain full history", t => {
  const thread = store.createThread({ projectId: store.openProject(process.cwd()).id, provider: "claude" });
  t.after(() => store.removeThread(thread.id));
  const messages = Array.from({ length: 100 }, (_, index) => message(index));
  store.replaceMessages(thread.id, messages);
  const replies = [];
  const send = reply => replies.push(reply);
  threadRoutes["thread.load"]({ t: "thread.load", id: thread.id }, send);
  assert.deepEqual(replies.shift(), { t: "thread.messages", threadId: thread.id, messages });
  t.mock.method(store, "readMessages", () => { throw new Error("Paged reads must bypass the full transcript"); });
  threadRoutes["thread.load"]({ t: "thread.load", id: thread.id, page: {}, requestId: "first-page" }, send);
  const latest = replies.shift();
  assert.equal(latest.requestId, "first-page");
  assert.equal(latest.messages.length, 80);
  threadRoutes["thread.load"]({ t: "thread.load", id: thread.id, page: { before: latest.page.next, revision: latest.page.revision }, requestId: "older-page" }, send);
  const older = replies.shift();
  assert.equal(older.messages.length, 20);
  assert.equal(older.requestId, "older-page");
  for (const event of [{ page: null }, { page: [] }, { page: { before: "", revision: 0 } }, { requestId: "" }, { requestId: 3 }])
    assert.throws(() => threadRoutes["thread.load"]({ t: "thread.load", id: thread.id, ...event }, send), /Invalid/);
  assert.throws(() => threadRoutes["thread.load"]({ t: "thread.load", id: "missing", page: {} }, send), /no longer exists/);
});

test("in-memory replacement projection retains event-time content and page bounds", () => {
  const messages = Array.from({ length: 100 }, (_, index) => message(index));
  const page = pageMessages(messages, 45);
  assert.equal(page.messages.length, 80);
  assert.deepEqual(page.page, { next: "message-20", revision: 45 });
  assert.equal(messages.length, 100);
  assert.equal(messages[0].id, "message-0");
  const large = [message("old", "x".repeat(400_000)), message("latest", "x".repeat(2 * 1024 * 1024))];
  assert.deepEqual(pageMessages(large, 46), { messages: [large[1]], page: { next: "message-latest", revision: 46 } });
  assert.deepEqual(pageMessages([], 47), { messages: [], page: { revision: 47 } });
});
