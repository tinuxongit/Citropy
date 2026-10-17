import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { store } from "../server/store.ts";
import { callWorkspaceTool } from "../server/mcp/mcp-workspace.ts";

test("notify_user notifies the user at most once a minute per conversation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-notify-user-"));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "claude" });
  t.after(async () => {
    store.removeThread(thread.id);
    store.projects.delete(project.id);
    await rm(directory, { recursive: true, force: true });
  });

  await callWorkspaceTool(thread.id, "notify_user", {
    title: "Build broke",
    text: "The deploy needs your token.",
  });
  const [notification] = store.notifications;
  assert.equal(notification.title, "Build broke");
  assert.equal(notification.text, "The deploy needs your token.");
  assert.deepEqual(notification.target, {
    view: "chat",
    projectId: project.id,
    threadId: thread.id,
  });
  await assert.rejects(
    callWorkspaceTool(thread.id, "notify_user", { title: "Again", text: "Too soon." }),
    /less than a minute ago/,
  );
  await assert.rejects(
    callWorkspaceTool(thread.id, "notify_user", { title: "Empty", text: " " }),
    /valid text/,
  );
});
