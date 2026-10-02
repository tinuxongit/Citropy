import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTimelineSelector } from "../web/src/lib/timeline.ts";
import { replaceHistory } from "../web/src/lib/history-cache.ts";
import { applyEvents } from "../web/src/lib/server-events.ts";
import { useApp } from "../web/src/lib/app-state.ts";
import { encodeServerEvent, SocketStream } from "../server/socket-stream.ts";

const directory = mkdtempSync(join(tmpdir(), "citropy-performance-"));
process.env.CITROPY_DATA_DIR = directory;
const { EventJournal } = await import("../server/event-journal.ts");
const { store } = await import("../server/store.ts");
const journal = new EventJournal(join(directory, "events.sqlite"));

try {
  journal.append({ t: "thread.upsert", thread: { id: "chat" } });
  journal.append({ t: "message.add", threadId: "chat", message: { id: "response", role: "assistant", ts: 1, parts: [{ id: "live", kind: "text", text: "" }] } });
  global.gc?.();
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const started = performance.now();
  for (let index = 0; index < 10000; index++)
    journal.append({ t: "part.append", threadId: "chat", messageId: "response", partId: "live", text: "streamed text " });
  const elapsed = performance.now() - started;
  const usage = process.cpuUsage(cpu);
  const rssGrowth = process.memoryUsage().rss - memory.rss;
  assert.equal(journal.messages("chat")[0].parts[0].text, "streamed text ".repeat(10000));
  console.log(JSON.stringify({ benchmark: "journal: 10000 durable text deltas", elapsedMs: elapsed, cpuMs: (usage.user + usage.system) / 1000, rssGrowthMiB: rssGrowth / 1024 / 1024 }));

  const state = { threads: { chat: { running: true, status: "working" } }, messages: {}, order: { chat: [] }, parts: new Map(), disclosures: {} };
  for (let index = 0; index < 5000; index++) {
    const id = `message${index}`;
    const partId = `part${index}`;
    state.order.chat.push(id);
    state.messages[id] = { id, role: index % 2 ? "assistant" : "user", ts: index, partIds: [partId] };
    state.parts.set(partId, { id: partId, kind: "text", text: "History ".repeat(100), complete: true });
  }
  const select = createTimelineSelector("chat");
  const rows = select(state);
  const snapshots = Array.from({ length: 300 }, (_, index) => ({ ...state, parts: new Map(state.parts).set("part4999", { ...state.parts.get("part4999"), text: `Streaming ${index}` }) }));
  global.gc?.();
  const selectionStarted = performance.now();
  for (const snapshot of snapshots) assert.strictEqual(select(snapshot), rows);
  console.log(JSON.stringify({ benchmark: "timeline selector: 5000 messages, 300 streaming updates", elapsedMs: performance.now() - selectionStarted }));

  let live = { ...state, parts: new Map(), messages: {}, order: {}, loaded: {}, reveals: {}, historyBytes: {}, timelineVersions: {}, disclosures: {}, activeThreadId: "chat" };
  replaceHistory(live, "chat", state.order.chat.map((id) => ({
    ...state.messages[id], parts: state.messages[id].partIds.map((partId) => state.parts.get(partId)),
  })));
  const selectLive = createTimelineSelector("chat");
  const liveRows = selectLive(live);
  global.gc?.();
  const liveStarted = performance.now();
  const liveCpu = process.cpuUsage();
  for (let index = 0; index < 300; index++) {
    live = applyEvents(live, [{ t: "part.append", threadId: "chat", messageId: "message4999", partId: "part4999", text: " next" }]);
    assert.strictEqual(selectLive(live), liveRows);
  }
  const liveUsage = process.cpuUsage(liveCpu);
  console.log(JSON.stringify({ benchmark: "store and timeline: 5000 messages, 300 text deltas", elapsedMs: performance.now() - liveStarted, cpuMs: (liveUsage.user + liveUsage.system) / 1000 }));

  const detailedInput = { paths: Array.from({ length: 10000 }, (_, index) => ({ path: `source-${index}.ts`, detail: { line: index, text: "x".repeat(100) } })) };
  let toolState = applyEvents({ ...useApp.getInitialState(), activeThreadId: "chat" }, [{ t: "thread.messages", threadId: "chat", messages: [{ id: "tool-message", role: "assistant", ts: 1, parts: [{ id: "detailed-tool", kind: "tool", name: "Read", callId: "call", shape: "read", headline: "source", status: "running", input: detailedInput, output: "first" }] }] }]);
  const retainedToolState = toolState;
  const toolStarted = performance.now();
  const toolCpu = process.cpuUsage();
  for (let index = 0; index < 300; index++) toolState = applyEvents(toolState, [{ t: "part.patch", threadId: "chat", messageId: "tool-message", partId: "detailed-tool", patch: { output: `update ${index}` } }]);
  const toolUsage = process.cpuUsage(toolCpu);
  assert.strictEqual(toolState.parts.get("detailed-tool").input, detailedInput);
  assert.equal(retainedToolState.parts.get("detailed-tool").output, "first");
  assert.equal(toolState.parts.get("detailed-tool").output, "update 299");
  assert.equal(toolState.historyBytes.chat, retainedToolState.historyBytes.chat + 10);
  console.log(JSON.stringify({ benchmark: "history byte accounting: 10000 retained input records, 300 output patches", elapsedMs: performance.now() - toolStarted, cpuMs: (toolUsage.user + toolUsage.system) / 1000, retainedRecords: toolState.parts.get("detailed-tool").input.paths.length }));

  const thread = { id: "metadata", messages: Array.from({ length: 10000 }, (_, index) => ({ id: `message-${index}`, ts: index, parts: [{ id: `tool-${index}`, kind: "tool", shape: "edit", status: "ok", input: { file_path: `file-${index % 100}.ts` } }] })) };
  assert.equal(store.meta(thread).changedFiles, 100);
  const metadataStarted = performance.now();
  for (let index = 0; index < 1000; index++) assert.equal(store.meta(thread).changedFiles, 100);
  console.log(JSON.stringify({ benchmark: "metadata: 10000 tools, 1000 status reads", elapsedMs: performance.now() - metadataStarted }));

  journal.append({ t: "thread.upsert", thread: { id: "history" } });
  for (let index = 0; index < 5000; index++) journal.append({ t: "message.add", threadId: "history", message: {
    id: `history-${index}`, role: "assistant", ts: index, parts: [{ id: `history-part-${index}`, kind: "text", text: "History ".repeat(100) }],
  } });
  const fullStarted = performance.now();
  const full = journal.messages("history");
  const fullElapsed = performance.now() - fullStarted;
  const pageStarted = performance.now();
  const page = journal.messagePage("history");
  const pageElapsed = performance.now() - pageStarted;
  const fullBytes = Buffer.byteLength(JSON.stringify(full));
  const pageBytes = Buffer.byteLength(JSON.stringify(page));
  assert.equal(page.messages.length, 80);
  assert.ok(pageBytes < fullBytes / 50);
  console.log(JSON.stringify({ benchmark: "history: 5000 messages versus latest page", fullElapsedMs: fullElapsed, pageElapsedMs: pageElapsed, fullBytes, pageBytes }));

  const frames = [];
  const stream = new SocketStream(0, ["chat"], frame => frames.push(frame), event => event);
  let originalBytes = 0;
  const transportStarted = performance.now();
  for (let index = 0; index < 1000; index++) {
    const progress = { t: "part.patch", threadId: "chat", messageId: "response", partId: "tool", patch: { output: "x".repeat(2048) + index }, sequence: index * 2 + 1 };
    const inactive = { t: "part.append", threadId: "inactive", messageId: "response", partId: "text", text: "x".repeat(2048), sequence: index * 2 + 2 };
    for (const event of [progress, inactive]) { originalBytes += Buffer.byteLength(JSON.stringify(event)); stream.push(event); }
  }
  stream.flush();
  stream.close();
  const wireBytes = frames.reduce((total, frame) => total + Buffer.byteLength(frame), 0);
  assert.equal(frames.length, 1);
  assert.ok(wireBytes < originalBytes / 1000);
  console.log(JSON.stringify({ benchmark: "transport: 1000 tool updates and 1000 inactive deltas", elapsedMs: performance.now() - transportStarted, originalMessages: 2000, wireMessages: frames.length, originalBytes, wireBytes }));

  const textFrames = [];
  const textStream = new SocketStream(0, ["chat"], frame => textFrames.push(frame), event => event);
  const textStarted = performance.now();
  const textCpu = process.cpuUsage();
  for (let sequence = 1; sequence <= 10000; sequence++) textStream.push({ t: "part.append", threadId: "chat", messageId: "response", partId: "text", text: "streamed text ", sequence });
  textStream.flush();
  textStream.close();
  const textUsage = process.cpuUsage(textCpu);
  assert.equal(textFrames.length, 1);
  assert.equal(JSON.parse(textFrames[0]).events[0].text, "streamed text ".repeat(10000));
  console.log(JSON.stringify({ benchmark: "transport: 10000 coalesced text deltas", elapsedMs: performance.now() - textStarted, cpuMs: (textUsage.user + textUsage.system) / 1000, wireMessages: textFrames.length, wireBytes: Buffer.byteLength(textFrames[0]) }));

  const partialFrames = [];
  const partialStream = new SocketStream(0, ["chat"], frame => partialFrames.push(frame), event => event);
  const partialStarted = performance.now();
  partialStream.push({ t: "part.patch", threadId: "chat", messageId: "response", partId: "tool", patch: { output: "x".repeat(200 * 1024) }, sequence: 1 });
  for (let sequence = 2; sequence <= 5001; sequence++) partialStream.push({ t: "part.patch", threadId: "chat", messageId: "response", partId: "tool", patch: { status: sequence % 2 ? "running" : "ok" }, sequence });
  partialStream.flush();
  partialStream.close();
  assert.equal(partialFrames.length, 1);
  assert.deepEqual(JSON.parse(partialFrames[0]).events[0].patch, { output: "x".repeat(200 * 1024), status: "running" });
  console.log(JSON.stringify({ benchmark: "transport: 5000 status patches retaining 200 KiB output", elapsedMs: performance.now() - partialStarted, wireMessages: partialFrames.length, wireBytes: Buffer.byteLength(partialFrames[0]) }));

  const broadcasts = Array.from({ length: 1000 }, (_, index) => ({ t: "toast", level: "info", text: `${index}${"x".repeat(4096)}` }));
  let repeatedBytes = 0;
  const repeatedStarted = performance.now();
  for (let client = 0; client < 8; client++) for (const event of broadcasts) repeatedBytes += Buffer.byteLength(JSON.stringify(event));
  const repeatedElapsed = performance.now() - repeatedStarted;
  let sharedBytes = 0;
  const sharedStarted = performance.now();
  for (let client = 0; client < 8; client++) for (const event of broadcasts) sharedBytes += Buffer.byteLength(encodeServerEvent(event));
  const sharedElapsed = performance.now() - sharedStarted;
  assert.equal(sharedBytes, repeatedBytes);
  console.log(JSON.stringify({ benchmark: "serialization: 1000 broadcasts, eight consumers", repeatedElapsedMs: repeatedElapsed, sharedElapsedMs: sharedElapsed, bytes: sharedBytes }));
} finally {
  journal.close();
  const { eventJournal } = await import("../server/event-journal.ts");
  eventJournal.close();
  rmSync(directory, { recursive: true, force: true });
}
