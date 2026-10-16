import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { callWorkspaceTool } from "../server/mcp/mcp-workspace.ts";
import { store } from "../server/store.ts";

const run = async (threadId, name, args) => {
  const result = (await callWorkspaceTool(threadId, "run_tool", { name, arguments: args }))[0].text;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
};

test("an agent adds, updates and removes the workspace's project scripts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-scripts-"));
  const project = store.openProject(directory);
  t.after(async () => {
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  const thread = store.createThread({
    projectId: project.id,
    provider: "claude",
    permissionMode: "manual",
    title: "Scripts",
  });
  const help = JSON.parse(
    (await callWorkspaceTool(thread.id, "tool_help", { category: "script" }))[0].text,
  );
  assert.deepEqual(
    help.map((tool) => tool.name),
    ["script_list", "script_save", "script_remove"],
  );

  const saved = await run(thread.id, "script_save", { name: " Dev ", command: "npm run dev" });
  assert.equal(saved.name, "Dev");
  assert.deepEqual(store.projects.get(project.id).scripts, [saved]);
  await run(thread.id, "script_save", {
    id: saved.id,
    name: "Dev",
    command: "npm run desktop:dev",
  });
  assert.deepEqual(await run(thread.id, "script_list", {}), [
    { ...saved, command: "npm run desktop:dev" },
  ]);

  await assert.rejects(
    run(thread.id, "script_save", { id: "scr_missing", name: "Dev", command: "true" }),
    /No project script scr_missing/,
  );
  await assert.rejects(
    run(thread.id, "script_save", { name: "x".repeat(81), command: "true" }),
    /Script name must be/,
  );
  thread.permissionMode = "plan";
  await assert.rejects(run(thread.id, "script_remove", { id: saved.id }), /Plan only mode/);
  thread.permissionMode = "manual";

  assert.equal(await run(thread.id, "script_remove", { id: saved.id }), "Project script deleted.");
  assert.deepEqual(store.projects.get(project.id).scripts, []);
});
