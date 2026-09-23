import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTimelineSelector } from "../web/src/lib/timeline.ts";

const directory = mkdtempSync(join(tmpdir(), "citropy-performance-"));
process.env.CITROPY_DATA_DIR = directory;
const { EventJournal } = await import("../server/event-journal.ts");
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
  assert.equal(journal.threads()[0].messages[0].parts[0].text, "streamed text ".repeat(10000));
  console.log(JSON.stringify({ benchmark: "journal: 10000 durable text deltas", elapsedMs: elapsed, cpuMs: (usage.user + usage.system) / 1000, rssGrowthMiB: rssGrowth / 1024 / 1024 }));

  const state = { threads: { chat: { running: true, status: "working" } }, messages: {}, order: { chat: [] }, parts: {}, disclosures: {} };
  for (let index = 0; index < 5000; index++) {
    const id = `message${index}`;
    const partId = `part${index}`;
    state.order.chat.push(id);
    state.messages[id] = { id, role: index % 2 ? "assistant" : "user", ts: index, partIds: [partId] };
    state.parts[partId] = { id: partId, kind: "text", text: "History ".repeat(100), complete: true };
  }
  const select = createTimelineSelector("chat");
  const rows = select(state);
  const snapshots = Array.from({ length: 300 }, (_, index) => ({ ...state, parts: { ...state.parts, part4999: { ...state.parts.part4999, text: `Streaming ${index}` } } }));
  global.gc?.();
  const selectionStarted = performance.now();
  for (const snapshot of snapshots) assert.strictEqual(select(snapshot), rows);
  console.log(JSON.stringify({ benchmark: "timeline selector: 5000 messages, 300 streaming updates", elapsedMs: performance.now() - selectionStarted }));
} finally {
  journal.close();
  rmSync(directory, { recursive: true, force: true });
}
