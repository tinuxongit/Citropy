import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { store } from "../server/store.ts";
import { disconnectTools } from "../server/mcp-access.ts";
import { callWorkspaceTool } from "../server/mcp-workspace.ts";
import { framedVisual, serveToolVisual } from "../server/tool-visuals.ts";
import { mcpInstructions } from "../server/mcp-instructions.ts";
import { resolveProjectSettings } from "../shared/project-settings.ts";

test("framing a visual keeps its doctype first and adds the theme setup once", () => {
  for (const page of ["<p>Hi</p>", "  <!DOCTYPE html><p>Hi</p>"]) {
    const framed = framedVisual(page);
    assert.match(framed, /^<!doctype html><base target="_blank">/i);
    assert.equal(framed.match(/<!doctype/gi).length, 1);
    assert.ok(framed.endsWith("<p>Hi</p>"));
  }
});

test("visual replies are saved per conversation and served with a locked-down policy", async t => {
  const workspace = await mkdtemp(join(tmpdir(), "citropy-visual-replies-"));
  const project = store.openProject(workspace);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "bypass" });
  t.after(async () => {
    disconnectTools(thread.id);
    store.removeThread(thread.id);
    store.projects.delete(project.id);
    await rm(workspace, { recursive: true, force: true });
  });
  const visual = JSON.parse((await callWorkspaceTool(thread.id, "run_tool", { name: "workspace_visual", arguments: { title: "Prices [2026]", html: "<h1>Chart</h1>" } }))[0].text);
  assert.equal(visual.markdown, `![Prices  2026 ](citropy-visual:${visual.id})`);
  await assert.rejects(callWorkspaceTool(thread.id, "run_tool", { name: "workspace_visual", arguments: { title: "Big", html: "x".repeat(513 * 1024) } }), /512 KiB/);
  store.projectDefaults = { visualReplies: false };
  await assert.rejects(callWorkspaceTool(thread.id, "run_tool", { name: "workspace_visual", arguments: { title: "Off", html: "<p>Off</p>" } }), /turned off/);
  const workspaceHelp = JSON.parse((await callWorkspaceTool(thread.id, "tool_help", { category: "workspace" }))[0].text);
  assert.ok(!workspaceHelp.some((tool) => tool.name === "workspace_visual"));
  store.projectDefaults = {};

  const server = createServer((req, res) => {
    void serveToolVisual(req, res, new URL(req.url, "http://localhost").searchParams).catch(error => res.destroy(error));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/?threadId=${thread.id}&id=${visual.id}`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /^sandbox allow-scripts .*default-src 'none'/);
  assert.ok((await response.text()).endsWith("<h1>Chart</h1>"));
  assert.equal((await fetch(url, { headers: { "if-none-match": response.headers.get("etag") } })).status, 304);
  assert.equal((await fetch(url, { headers: { "if-none-match": '"older-frame"' } })).status, 200);
  assert.equal((await fetch(url.replace(thread.id, "another-conversation"))).status, 404);
});

test("visuals can be built in parts and changed with edits without rewriting them", async t => {
  const workspace = await mkdtemp(join(tmpdir(), "citropy-visual-edits-"));
  const project = store.openProject(workspace);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "plan" });
  t.after(async () => {
    disconnectTools(thread.id);
    store.removeThread(thread.id);
    store.projects.delete(project.id);
    await rm(workspace, { recursive: true, force: true });
  });
  const run = async (name, args) => JSON.parse((await callWorkspaceTool(thread.id, "run_tool", { name, arguments: args }))[0].text);
  const source = async id => (await run("workspace_visual_source", { id })).text;

  const { draft } = await run("workspace_visual_draft", { html: "<h1>Sales</h1>" });
  assert.deepEqual(await run("workspace_visual_draft", { draft, html: "<p>Up 4%</p>" }), { draft, bytes: 26 });
  const first = await run("workspace_visual", { title: "Sales", from: draft, edits: [{ find: "4%", replace: "5%" }] });
  assert.equal(await source(first.id), "<h1>Sales</h1><p>Up 5%</p>");
  await assert.rejects(source(draft), /was not found/);

  const second = await run("workspace_visual", { title: "Sales", from: first.id, edits: [{ find: "Sales", replace: "Revenue" }] });
  assert.notEqual(second.id, first.id);
  assert.equal(await source(second.id), "<h1>Revenue</h1><p>Up 5%</p>");
  assert.equal(await source(first.id), "<h1>Sales</h1><p>Up 5%</p>");
  assert.deepEqual(await run("workspace_visual_source", { id: second.id, limit: 4 }), { text: "<h1>", offset: 0, totalCharacters: 28, nextOffset: 4 });

  await assert.rejects(run("workspace_visual", { title: "x", from: first.id, edits: [{ find: "Missing", replace: "" }] }), /Edit 1 did not match/);
  await assert.rejects(run("workspace_visual", { title: "x", from: first.id, edits: [{ find: "p>", replace: "" }] }), /Edit 1 matches more than once/);
  await assert.rejects(run("workspace_visual", { title: "x", html: "<p></p>", from: first.id }), /either html or from/);
  await assert.rejects(run("workspace_visual_draft", { draft: first.id, html: "<p></p>" }), /Only drafts/);
  await assert.rejects(run("workspace_visual_source", { id: "../secrets" }), /Unknown visual/);
  const big = await run("workspace_visual_draft", { html: "x".repeat(512 * 1024) });
  await assert.rejects(run("workspace_visual_draft", { draft: big.draft, html: "x" }), /512 KiB/);
});

test("agents are told to browse in Citropy only when the setting and browser access allow it", () => {
  const browseFirst = /instead of built-in web search/;
  assert.match(mcpInstructions(undefined), browseFirst);
  assert.match(mcpInstructions(undefined), /browser_connections.*ask_user before buying/);
  assert.doesNotMatch(mcpInstructions({ browserFirst: false }), browseFirst);
  const blocked = mcpInstructions({ browserAccess: false });
  assert.doesNotMatch(blocked, browseFirst);
  assert.doesNotMatch(blocked, /browser_connections/);
});

test("agents are told about visual replies only while the setting is on", () => {
  assert.match(mcpInstructions(undefined), /workspace_visual/);
  assert.doesNotMatch(mcpInstructions({ visualReplies: false }), /workspace_visual/);
});

test("browser and visual reply switches apply to every folder", () => {
  const folder = { autoPull: true, browserAccess: false, browserFirst: false, visualReplies: false };
  assert.deepEqual(
    resolveProjectSettings({}, folder),
    { ...resolveProjectSettings(), autoPull: true },
  );
});
