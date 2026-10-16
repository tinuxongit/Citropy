import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { callWorkspaceTool } from "../server/mcp/mcp-workspace.ts";
import { answer, ask, pendingRequests } from "../server/permissions.ts";
import { store } from "../server/store.ts";
import { normalizeQuestions } from "../shared/questions.ts";

test("questions can point the user at a browser tab", () => {
  const [question] = normalizeQuestions([{ question: "Sign in to Gmail, then press Done.", options: [{ label: "Done" }], browserTab: "panel_one" }]);
  assert.equal(question.browserTab, "panel_one");
  assert.throws(() => normalizeQuestions([{ question: "Sign in.", browserTab: " " }]), /browser tab's id/);
});

test("ask_user rejects a browser tab that is not open", async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-handoff-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: "Handoff" });
  await assert.rejects(
    callWorkspaceTool(thread.id, "ask_user", { questions: [{ question: "Sign in, then press Done.", browserTab: "panel_missing" }] }),
    /No browser tab panel_missing is open/,
  );
});

test("a conversation waiting for approval shows as needing input until it is answered", async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-approval-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: "Approval" });
  store.patchThread(thread.id, { running: true, status: "working" });
  const decision = ask(thread.id, "Bash", { command: "ls" });
  assert.equal(store.threads.get(thread.id).status, "awaiting");
  answer(pendingRequests().find(request => request.threadId === thread.id).id, "allow");
  assert.equal(await decision, "allow");
  assert.equal(store.threads.get(thread.id).status, "working");
});
