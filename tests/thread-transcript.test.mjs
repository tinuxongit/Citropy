import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { store } from "../server/store.ts";
import { ThreadTranscript } from "../server/thread-transcript.ts";
import { SubagentTranscripts } from "../server/subagent-transcripts.ts";

test("text and reasoning record when they end so work time counts thinking", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "citropy-transcript-"));
  const project = store.openProject(workspace);
  const thread = store.createThread({
    projectId: project.id,
    provider: "opencode",
    permissionMode: "bypass",
  });
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

test("a subagent's follow-up message starts a new exchange in its chat", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "citropy-transcript-"));
  const project = store.openProject(workspace);
  const parent = store.createThread({
    projectId: project.id,
    provider: "claude",
    permissionMode: "bypass",
  });
  t.after(async () => {
    for (const thread of [...store.threads.values()].filter(
      (entry) => entry.parentThreadId === parent.id,
    ))
      store.removeThread(thread.id);
    store.removeThread(parent.id);
    store.projects.delete(project.id);
    await rm(workspace, { recursive: true, force: true });
  });
  store.updateSubagent(parent.id, {
    id: "agent",
    title: "Coder",
    status: "working",
    runPrompt: "Build blocks",
  });
  store.updateSubagent(parent.id, { id: "agent", status: "idle", result: "Blocks built" });
  store.updateSubagent(parent.id, { id: "agent", status: "working", runPrompt: "Add textures" });
  store.updateSubagent(parent.id, { id: "agent", status: "idle", result: "Textures added" });
  const child = [...store.threads.values()].find((entry) => entry.parentThreadId === parent.id);
  assert.deepEqual(
    child.messages.map((message) => [message.role, message.parts[0].text]),
    [
      ["user", "Build blocks"],
      ["assistant", "Blocks built"],
      ["user", "Add textures"],
      ["assistant", "Textures added"],
    ],
  );
});

test("a subagent's work fills its own chat under its parent and a stop ends its running tool", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "citropy-transcript-"));
  const project = store.openProject(workspace);
  const parent = store.createThread({
    projectId: project.id,
    provider: "claude",
    permissionMode: "bypass",
  });
  t.after(async () => {
    for (const thread of [...store.threads.values()].filter(
      (entry) => entry.parentThreadId === parent.id,
    ))
      store.removeThread(thread.id);
    store.removeThread(parent.id);
    store.projects.delete(project.id);
    await rm(workspace, { recursive: true, force: true });
  });
  const subagents = new SubagentTranscripts(parent.id);
  subagents.update({
    type: "subagent",
    id: "lead",
    title: "Lead",
    status: "working",
    launchId: "launch",
  });
  subagents.update({
    type: "subagent",
    id: "leaf",
    title: "Leaf",
    status: "working",
    parent: "lead",
  });
  subagents.record({
    type: "subagent.activity",
    id: "leaf",
    event: { type: "block.start", blockId: "leaf-reply", block: "text" },
  });
  const lead = store.findSubagent(parent.id, "lead");
  assert.equal(lead.nativeLaunchId, "launch");
  assert.equal(store.findSubagent(parent.id, "leaf").parentThreadId, lead.id);
  assert.throws(
    () =>
      subagents.update({ type: "subagent", id: "orphan", status: "working", parent: "missing" }),
    /unknown subagent missing/,
  );
  assert.throws(
    () =>
      subagents.record({
        type: "subagent.activity",
        id: "agent",
        event: { type: "block.end", blockId: "early" },
      }),
    /before it started/,
  );
  subagents.update({
    type: "subagent",
    id: "agent",
    title: "Coder",
    status: "working",
    runPrompt: "Build blocks",
  });
  const activity = (event) => subagents.record({ type: "subagent.activity", id: "agent", event });
  activity({ type: "block.start", blockId: "reply", block: "text" });
  activity({ type: "block.delta", blockId: "reply", text: "Listing files" });
  activity({ type: "block.end", blockId: "reply" });
  activity({ type: "tool.start", callId: "bash", name: "Bash", input: { command: "ls" } });
  activity({ type: "tool.end", callId: "bash", ok: true, output: "blocks.ts" });
  activity({ type: "tool.start", callId: "slow", name: "Bash", input: { command: "sleep 60" } });
  subagents.update({ type: "subagent", id: "agent", status: "stopped" });
  const child = store.findSubagent(parent.id, "agent");
  assert.equal(child.status, "stopped");
  assert.deepEqual(
    child.messages.map((message) => [
      message.role,
      message.parts.map((part) =>
        part.kind === "tool" ? `${part.name}:${part.status}` : part.text,
      ),
    ]),
    [
      ["user", ["Build blocks"]],
      ["assistant", ["Listing files", "Bash:ok", "Bash:stopped"]],
    ],
  );
});
