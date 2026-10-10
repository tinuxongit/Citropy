import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { store } from "../server/store.ts";
import { ThreadTranscript } from "../server/thread-transcript.ts";

test("text and reasoning record when they end so work time counts thinking", async t => {
  const workspace = await mkdtemp(join(tmpdir(), "citropy-transcript-"));
  const project = store.openProject(workspace);
  const thread = store.createThread({ projectId: project.id, provider: "opencode", permissionMode: "bypass" });
  t.after(async () => {
    store.removeThread(thread.id);
    store.projects.delete(project.id);
    await rm(workspace, { recursive: true, force: true });
  });
  const transcript = new ThreadTranscript(thread);
  const before = Date.now();
  transcript.startBlock({ type: "block.start", blockId: "thinking", block: "reasoning" });
  transcript.endBlock({ type: "block.end", blockId: "thinking" });
  transcript.startBlock({ type: "block.start", blockId: "reply", block: "text" });
  transcript.finish(false);
  const [thinking, reply] = store.threads.get(thread.id).messages.at(-1).parts;
  assert.ok(thinking.endedAt >= before);
  assert.ok(reply.endedAt >= thinking.endedAt);
});
