import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { store } from "../server/store.ts";
import { handleMcp } from "../server/mcp.ts";
import { connectTools, disconnectTools } from "../server/mcp-access.ts";
import { callWorkspaceTool } from "../server/mcp-workspace.ts";
import { answer, pendingRequests } from "../server/permissions.ts";
import { previewFile } from "../server/assets.ts";
import { serveToolImage } from "../server/tool-images.ts";

const picture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");

async function fixture(t, permissionMode = "bypass") {
  const directory = await mkdtemp(join(tmpdir(), "citropy-workspace-images-"));
  const workspace = join(directory, "workspace");
  await mkdir(workspace);
  const project = store.openProject(workspace);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode });
  const path = join(directory, "screenshot.png");
  await writeFile(path, picture);
  t.after(async () => {
    disconnectTools(thread.id);
    store.removeThread(thread.id);
    store.projects.delete(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, workspace, project, thread, path };
}

test("sharing a temporary screenshot survives source removal and stays scoped to its conversation", async t => {
  const { project, thread, path } = await fixture(t);
  await assert.rejects(previewFile(new URLSearchParams({ projectId: project.id, threadId: thread.id, path })), /outside this conversation's workspace/);
  const help = JSON.parse((await callWorkspaceTool(thread.id, "tool_help", { category: "workspace" }))[0].text);
  assert.ok(help.some(tool => tool.name === "workspace_image"));
  const image = JSON.parse((await callWorkspaceTool(thread.id, "run_tool", { name: "workspace_image", arguments: { path } }))[0].text);
  assert.equal(image.markdown, `![Image](citropy-image:${image.id})`);
  await rm(path);
  const server = createServer((req, res) => {
    void serveToolImage(req, res, new URL(req.url, "http://localhost").searchParams).catch(error => res.destroy(error));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/?threadId=${thread.id}&id=${image.id}`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), picture);
  assert.equal((await fetch(url.replace(thread.id, "another-conversation"))).status, 404);
});

test("screenshots a tool reported outside the workspace open only in their conversation", async t => {
  const { project, thread, path } = await fixture(t);
  const other = await fixture(t);
  const preview = (threadId, projectId = project.id) => previewFile(new URLSearchParams({ projectId, threadId, path }));
  await assert.rejects(preview(thread.id), /outside this conversation's workspace/);
  store.addMessage(thread.id, { id: "msg_screenshot", role: "assistant", ts: Date.now(), parts: [] });
  store.addPart(thread.id, "msg_screenshot", { id: "prt_screenshot", kind: "tool", callId: "call_screenshot", name: "Read", shape: "read", headline: "Read screenshot", input: { path }, status: "running", startedAt: Date.now() });
  await assert.rejects(preview(thread.id), /outside this conversation's workspace/);
  store.patchPart(thread.id, "msg_screenshot", "prt_screenshot", { status: "ok", imageFiles: [{ path, label: "screenshot.png" }] });
  assert.equal((await preview(thread.id)).path, path);
  await assert.rejects(preview(other.thread.id, other.project.id), /outside this conversation's workspace/);
});

test("outside-workspace image sharing respects plan mode and manual approval", async t => {
  const { thread, path } = await fixture(t, "plan");
  await assert.rejects(callWorkspaceTool(thread.id, "workspace_image", { path }), /Plan only mode/);
  store.patchThread(thread.id, { permissionMode: "manual" });
  for (const decision of ["deny", "allow"]) {
    const sharing = callWorkspaceTool(thread.id, "workspace_image", { path });
    const result = decision === "deny" ? assert.rejects(sharing, /Denied by the operator/) : sharing;
    let request;
    for (let attempt = 0; attempt < 100 && !request; attempt++) {
      request = pendingRequests().find(request => request.threadId === thread.id);
      if (!request) await delay(10);
    }
    assert.ok(request, "Image permission was not requested");
    assert.equal(request.tool, "mcp__citropy__workspace_image");
    assert.equal(request.input.path, path);
    answer(request.id, decision);
    const content = await result;
    if (decision === "allow") assert.match(JSON.parse(content[0].text).markdown, /^!\[Image\]\(citropy-image:[0-9a-f-]{36}\)$/);
  }
});

test("agents receive persistent image sharing instructions", async t => {
  const { thread } = await fixture(t);
  const server = createServer((req, res) => {
    void handleMcp(req.url.slice(1), req, res).catch(error => res.destroy(error));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const tools = connectTools(thread.id);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/${thread.id}`, {
    method: "POST",
    headers: { ...tools.headers, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
  });
  assert.equal(response.status, 200);
  const { result } = await response.json();
  assert.ok(result.instructions.includes('tool_help with {"category":"workspace"}'));
  assert.ok(result.instructions.includes('"name":"workspace_image"'));
  assert.ok(result.instructions.includes("Use the returned markdown verbatim"));
});
