import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeServerEvent, SocketStream } from "../server/socket-stream.ts";

function fixture(after = 0, ids = ["chat"]) {
  const messages = [];
  const stream = new SocketStream(after, ids, message => messages.push(message), event => event);
  return { stream, messages, events: () => messages.map(message => JSON.parse(message)) };
}

test("selective streams advance the global cursor while retaining shared events", () => {
  const { stream, events } = fixture(10);
  stream.push({ t: "part.append", threadId: "other", messageId: "m", partId: "p", text: "hidden", sequence: 11 });
  stream.push({ t: "permission.close", id: "permission", sequence: 12 });
  stream.push({ t: "part.append", threadId: "chat", messageId: "m", partId: "p", text: "visible", sequence: 13 });
  stream.flush();
  assert.deepEqual(events(), [{ t: "event.batch", after: 10, sequence: 13, events: [
    { t: "permission.close", id: "permission", sequence: 12 },
    { t: "part.append", threadId: "chat", messageId: "m", partId: "p", text: "visible", sequence: 13 },
  ] }]);
  stream.close();
});

test("tool progress and text deltas coalesce without changing durable inputs", () => {
  const { stream, events } = fixture();
  const first = { t: "part.patch", threadId: "chat", messageId: "m", partId: "tool", patch: { output: "first", status: "running" }, sequence: 1 };
  stream.push(first);
  stream.push({ t: "thread.upsert", thread: { id: "chat", updatedAt: 1 }, sequence: 2 });
  stream.push({ ...first, patch: { output: "final" }, sequence: 3 });
  stream.push({ t: "thread.upsert", thread: { id: "chat", updatedAt: 2 }, sequence: 4 });
  stream.push({ t: "part.append", threadId: "chat", messageId: "m", partId: "text", text: "a", sequence: 5 });
  stream.push({ t: "part.append", threadId: "chat", messageId: "m", partId: "text", text: "b", sequence: 6 });
  stream.push({ ...first, patch: { status: "ok" }, sequence: 7 });
  stream.flush();
  const batch = events()[0];
  assert.equal(batch.sequence, 7);
  assert.deepEqual(batch.events.map(event => event.t), ["part.patch", "thread.upsert", "part.append", "part.patch"]);
  assert.deepEqual(batch.events[0].patch, { output: "final", status: "running" });
  assert.equal(batch.events[1].thread.updatedAt, 2);
  assert.equal(batch.events[2].text, "ab");
  assert.equal(first.patch.output, "first");
  stream.close();
});

test("replacement boundaries, private replies and subscriptions preserve order", () => {
  const { stream, events } = fixture();
  const delta = sequence => ({ t: "part.append", threadId: "chat", messageId: "m", partId: "p", text: "x", sequence });
  stream.push(delta(1));
  stream.push({ t: "thread.messages", threadId: "chat", messages: [], sequence: 2 });
  stream.push(delta(3));
  stream.push({ t: "thread.messages", threadId: "chat", messages: [], requestId: "read" });
  stream.subscribe(["other"]);
  stream.push(delta(4));
  stream.flush();
  assert.deepEqual(events().map(event => event.t), ["event.batch", "thread.messages", "event.batch"]);
  assert.deepEqual(events()[0].events.map(event => event.t), ["part.append", "thread.messages", "part.append"]);
  assert.deepEqual(events()[2], { t: "event.batch", after: 3, sequence: 4, events: [] });
  stream.close();
});

test("coalesced text preserves escaping, empty deltas and split surrogate pairs", () => {
  const { stream, events } = fixture();
  const chunks = ["\ud83d", "", "\ude00", '"', "\\", "\n", "\ud800", "\ud800", "\udc00", "é", "👩", "\ud83d", "\ude00"];
  const first = { t: "part.append", threadId: "chat", messageId: "m", partId: "p", text: chunks[0], sequence: 1 };
  stream.push(first);
  for (let index = 1; index < chunks.length; index++) stream.push({ ...first, text: chunks[index], sequence: index + 1 });
  stream.flush();
  assert.deepEqual(events(), [{ t: "event.batch", after: 0, sequence: chunks.length, events: [{ ...first, text: chunks.join(""), sequence: chunks.length }] }]);
  assert.equal(first.text, chunks[0]);
  stream.close();
});

test("coalesced text flushes at its encoded byte budget across Unicode boundaries", () => {
  const { stream, messages } = fixture();
  const chunks = ["\ud83d", "", "\ude00", '"', "\\", "\n", "é"];
  let pending;
  let after = 0;
  let count = 0;
  for (let sequence = 1; sequence <= 200; sequence++) {
    const event = { t: "part.append", threadId: "chat", messageId: "m", partId: "p", text: sequence === 1 || !pending ? "x".repeat(262000) : chunks[sequence % chunks.length], sequence };
    pending = { ...event, text: (pending?.text ?? "") + event.text };
    stream.push(event);
    if (Buffer.byteLength(JSON.stringify(pending)) >= 256 * 1024) {
      assert.equal(messages.length, ++count);
      assert.deepEqual(JSON.parse(messages[count - 1]), { t: "event.batch", after, sequence, events: [pending] });
      after = sequence;
      pending = undefined;
    } else assert.equal(messages.length, count);
  }
  stream.flush();
  assert.ok(count > 1);
  if (pending) assert.deepEqual(JSON.parse(messages[count]), { t: "event.batch", after, sequence: 200, events: [pending] });
  stream.close();
});

test("partial tool patches retain fields and their encoded byte budget", () => {
  const { stream, messages } = fixture();
  let pending;
  let after = 0;
  let count = 0;
  for (let sequence = 1; sequence <= 200; sequence++) {
    const patch = !pending ? { output: "x".repeat(262000), status: "running" } : {
      status: sequence,
      detail: sequence % 2 ? undefined : { text: 'é"\\\n', values: [null, true, 123] },
      'escaped"key': sequence % 3 ? "é".repeat(sequence % 100) : undefined,
    };
    const event = { t: "part.patch", threadId: "chat", messageId: "m", partId: "tool", patch, sequence };
    pending = { ...event, patch: { ...pending?.patch, ...patch } };
    stream.push(event);
    if (Buffer.byteLength(JSON.stringify(pending)) >= 256 * 1024) {
      assert.equal(messages.length, ++count);
      assert.deepEqual(JSON.parse(messages[count - 1]), { t: "event.batch", after, sequence, events: [JSON.parse(JSON.stringify(pending))] });
      after = sequence;
      pending = undefined;
    } else assert.equal(messages.length, count);
  }
  stream.flush();
  assert.ok(count > 1);
  if (pending) assert.deepEqual(JSON.parse(messages[count]), { t: "event.batch", after, sequence: 200, events: [JSON.parse(JSON.stringify(pending))] });
  stream.close();
});

test("serialization is shared across consumers of the same immutable event", () => {
  let count = 0;
  const event = { t: "toast", text: "shared", toJSON() { count++; return { t: this.t, text: this.text }; } };
  assert.equal(encodeServerEvent(event), encodeServerEvent(event));
  assert.equal(count, 1);
});

test("inactive transcript and replaceable progress stay within deterministic wire budgets", () => {
  const { stream, messages, events } = fixture();
  let originalBytes = 0;
  let sequence = 0;
  for (let index = 0; index < 1000; index++) {
    const progress = { t: "part.patch", threadId: "chat", messageId: "m", partId: "tool", patch: { output: "x".repeat(2048) + index }, sequence: ++sequence };
    const inactive = { t: "part.append", threadId: "other", messageId: "m", partId: "p", text: "x".repeat(2048), sequence: ++sequence };
    for (const event of [progress, inactive]) { originalBytes += Buffer.byteLength(JSON.stringify(event)); stream.push(event); }
  }
  stream.flush();
  assert.equal(messages.length, 1);
  assert.equal(events()[0].sequence, 2000);
  assert.equal(events()[0].events.length, 1);
  assert.equal(events()[0].events[0].patch.output, "x".repeat(2048) + 999);
  assert.ok(Buffer.byteLength(messages[0]) < originalBytes / 1000);
  stream.close();
});
