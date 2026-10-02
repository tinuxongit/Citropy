import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { workspaceTools, toolCategories } from "../server/mcp-catalog.ts";
import { callWorkspaceTool } from "../server/mcp-workspace.ts";
import { handleFeatures } from "../server/features.ts";
import { openPanel, closePanel, panelList } from "../server/panels.ts";
import { closeProject } from "../server/routes/projects.ts";
import { store } from "../server/store.ts";
import { useApp } from "../web/src/lib/app-state.ts";
import { applySnapshot } from "../web/src/lib/snapshot-state.ts";
import { applyEvents } from "../web/src/lib/server-events.ts";
import { summarize } from "../web/src/lib/group.ts";

test("native control cannot be discovered or executed while shared browser tools remain available", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "citropy-native-removal-"));
  const project = store.openProject(cwd);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "bypass" });
  t.after(async () => { await closeProject(project.id); await rm(cwd, { recursive: true, force: true }); });
  assert.ok(!toolCategories.includes("computer"));
  assert.ok(!workspaceTools.some(tool => tool.name.startsWith("computer_")));
  await assert.rejects(callWorkspaceTool(thread.id, "tool_help", { category: "computer" }), /Unknown tool category/);
  for (const name of ["computer_help", "computer_status", "computer_start", "computer_screenshot", "computer_action", "computer_stop"])
    await assert.rejects(callWorkspaceTool(thread.id, "run_tool", { name, arguments: {} }), /Unknown workspace tool/);
  const browser = JSON.parse((await callWorkspaceTool(thread.id, "tool_help", { category: "browser" }))[0].text);
  assert.ok(browser.some(tool => tool.name === "browser_open"));
  assert.ok(browser.some(tool => tool.name === "browser_action"));
  assert.deepEqual(JSON.parse((await callWorkspaceTool(thread.id, "browser_tabs", {}))[0].text), []);
  assert.throws(() => openPanel(project.id, "computer"), /Unknown panel type/);
  await assert.rejects(callWorkspaceTool(thread.id, "open_panel", { kind: "computer" }), /Unknown panel kind/);
  const panel = openPanel(project.id, "browser");
  assert.ok(panelList().includes(panel));
  closePanel(panel.id);
});

test("removed native control HTTP endpoints return not found for reads and mutations", async t => {
  const server = createServer(async (req, res) => {
    if (!await handleFeatures(req, res, [])) res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [method, path] of [["GET", ""], ["PATCH", ""], ["POST", "/start"], ["POST", "/stop"], ["POST", "/pause"], ["GET", "/screenshot"], ["POST", "/action"], ["POST", "/skill"]]) {
    const response = await fetch(`${origin}/api/computer${path}`, {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify({ enabled: true, action: "type", text: "unavailable" }) }),
    });
    assert.equal(response.status, 404, `${method} ${path}`);
    await response.text();
  }
});

test("legacy native panels and state replay stay inert without losing browser panels or tool history", () => {
  const project = { id: "workspace", path: "/workspace", name: "Workspace", isGit: false, lastOpened: 0 };
  const computer = { id: "old-native", kind: "computer", projectId: project.id, title: "Computer" };
  const browser = { id: "shared-browser", kind: "browser", projectId: project.id, title: "Browser" };
  const state = { ...useApp.getState(), activeProjectId: project.id, activePanels: { [project.id]: computer.id }, editorTerminals: {} };
  applySnapshot(state, { home: "/", projects: [project], threads: [], providers: [], permissions: [], panels: [computer, browser], computer: { enabled: true, status: "active" } }, false);
  assert.deepEqual(state.panels, [browser]);
  assert.deepEqual(state.activePanels, {});
  assert.ok(!("computer" in state));
  const replayed = applyEvents(state, [{ t: "computer.state", computer: { enabled: true, status: "active" } }, { t: "panel.upsert", panel: computer }], false);
  assert.equal(replayed, state);
  const updated = applyEvents(state, [{ t: "panel.upsert", panel: { ...browser, title: "Still available" } }], false);
  assert.equal(updated.panels[0].title, "Still available");
  assert.equal(summarize([{ kind: "tool", shape: "computer", headline: "Inspect the desktop" }]), "Used the computer 1 time");
});
