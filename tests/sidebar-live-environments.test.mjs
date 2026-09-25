import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, contextTokens: 0, contextMax: 200000, turns: 0 };
const makeThread = (id, title, extra = {}) => ({
  id, projectId: "project", provider: "claude", model: "test", title,
  createdAt: 1, updatedAt: 2, running: false, status: "idle",
  permissionMode: "manual", usage, ...extra,
});
const localThreads = [makeThread("same", "Local task")];
const remoteThreads = [
  makeThread("same", "Remote pinned", { pinned: true }),
  makeThread("remote-action", "Remote action"),
  makeThread("remote-next", "Remote next"),
  makeThread("remote-child", "Remote subagent", { parentThreadId: "remote-action", parentMessageId: "message", running: true, status: "working" }),
  makeThread("remote-finished", "Remote finished", { finished: true }),
];

test("live SSH threads share sidebar groups and actions with local threads", { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-sidebar-live-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), cacheDir: join(directory, "cache"), plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const events = [];
  let remoteSocket;
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("citropy.sidebarMode", "global");
    localStorage.setItem("citropy.project", "project");
    localStorage.setItem("citropy.thread", "same");
    localStorage.setItem("citropy.inspector", "0");
    const listeners = new Set();
    let activeId = "local";
    const state = () => ({ activeId, endpoint: activeId === "local" ? "" : "http://127.0.0.1:49121", connections: [{ id: "ssh", name: "Build server", target: "build", port: 22, node: "node", status: "connected", endpoint: "http://127.0.0.1:49121" }] });
    window.citropyDesktop = {
      environmentsState: async () => state(),
      onEnvironmentsState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      onBrowserSelect: () => () => {},
      connectEnvironment: async id => { activeId = id; for (const listener of listeners) listener(state()); return state(); },
    };
  });
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/threads/organize") {
      assert.equal(url.port, "49121");
      const thread = remoteThreads.find(entry => entry.id === url.searchParams.get("threadId"));
      Object.assign(thread, route.request().postDataJSON());
      remoteSocket.send(JSON.stringify({ t: "thread.upsert", thread }));
    }
    if (url.pathname === "/api/threads/reorder") assert.equal(url.port, "49121");
    return route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*" } });
  });
  await page.routeWebSocket("**/socket", socket => {
    const remote = socket.url().includes(":49121/");
    if (remote) remoteSocket = socket;
    const threads = remote ? remoteThreads : localThreads;
    socket.onMessage(raw => {
      const event = JSON.parse(raw);
      events.push({ remote, ...event });
      if (event.t === "thread.search") socket.send(JSON.stringify({ t: "thread.search", query: event.query, projectId: event.projectId, results: threads.filter(thread => thread.title.toLowerCase().includes(event.query.toLowerCase())).map(thread => ({ threadId: thread.id, snippet: "" })) }));
      if (event.t === "thread.finish") {
        const thread = threads.find(entry => entry.id === event.id);
        thread.finished = event.finished;
        socket.send(JSON.stringify({ t: "thread.upsert", thread }));
      }
      if (event.t === "thread.remove") {
        const index = threads.findIndex(thread => thread.id === event.id);
        threads.splice(index, 1);
        socket.send(JSON.stringify({ t: "thread.remove", id: event.id }));
      }
      if (event.t === "thread.load") socket.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: [] }));
    });
    socket.send(JSON.stringify({ t: "hello", snapshot: {
      projects: [{ id: "project", name: remote ? "Remote project" : "Local project", path: remote ? "/remote/project" : "/local/project", isGit: true, lastOpened: 1 }],
      threads, providers: [{ id: "claude", label: remote ? "Remote Claude" : "Local Claude", available: true, enabled: true, models: [{ id: "test", label: remote ? "Remote model" : "Local model" }] }],
      permissions: [], home: remote ? "/remote" : "/local",
    } }));
  });
  await page.goto(server.resolvedUrls.local[0]);
  const sidebar = page.locator('.rail[data-sidebar-mode="global"]');
  const local = sidebar.locator('.thread-entry[data-environment="local"][data-thread-id="same"]');
  const remote = sidebar.locator('.thread-entry[data-environment="ssh"][data-thread-id="same"]');
  await local.waitFor();
  await remote.waitFor();
  assert.equal(await local.locator(".thread-card").getAttribute("data-active"), "true");
  assert.equal(await remote.locator(".thread-card").getAttribute("data-active"), "false");
  const localProject = sidebar.locator('.thread-category[data-category="project:project"]');
  const remoteProject = sidebar.locator('.thread-category[data-category="environment:ssh:project:project"]');
  assert.equal(await localProject.getByRole("button", { name: "Local task", exact: true }).count(), 1);
  assert.equal(await localProject.getByRole("button", { name: "Remote action", exact: true }).count(), 0);
  await remoteProject.getByRole("button", { name: "Remote action", exact: true }).waitFor();
  await remoteProject.getByRole("button", { name: "Remote subagent", exact: false }).waitFor();
  const child = remoteThreads.find(thread => thread.id === "remote-child");
  Object.assign(child, { running: false, status: "idle" });
  remoteSocket.send(JSON.stringify({ t: "thread.upsert", thread: child }));
  await remoteProject.getByRole("button", { name: "Remote subagent", exact: false }).waitFor({ state: "detached" });
  await remoteProject.getByRole("button", { name: "Remote action", exact: true }).hover();
  const preview = page.locator(".thread-preview");
  await preview.waitFor();
  assert.match(await preview.innerText(), /Remote model/);
  assert.match(await preview.innerText(), /~\/project/);
  await page.mouse.move(800, 500);
  await preview.waitFor({ state: "detached" });
  const reordered = page.waitForResponse(response => response.url().includes("/api/threads/reorder"));
  await remoteProject.getByRole("button", { name: "Remote action", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move down" }).click();
  const reorderRequest = (await reordered).request();
  assert.equal(new URL(reorderRequest.url()).port, "49121");
  assert.deepEqual(reorderRequest.postDataJSON().ids, ["same", "remote-next", "remote-action", "remote-finished"]);
  await remoteProject.getByRole("button", { name: "Remote action", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin conversation" }).click();
  await sidebar.locator('.thread-category[data-category="pinned"]').getByRole("button", { name: "Remote action", exact: true }).waitFor();
  assert.equal(await remoteProject.getByRole("button", { name: "Remote action", exact: true }).count(), 0);
  await sidebar.locator('.thread-category[data-category="pinned"]').getByRole("button", { name: "Remote action", exact: true }).hover();
  await sidebar.locator('.thread-category[data-category="pinned"]').getByRole("button", { name: "Finish Remote action" }).click();
  await sidebar.locator('.thread-category[data-category="finished"]').getByRole("button", { name: "Remote action", exact: true }).waitFor();
  assert.ok(events.some(event => event.remote && event.t === "thread.finish" && event.id === "remote-action"));
  await sidebar.getByRole("textbox", { name: "Find a conversation" }).fill("Remote pinned");
  await sidebar.locator('.thread-category[data-category="pinned"]').getByRole("button", { name: "Remote pinned", exact: true }).waitFor();
  assert.ok(events.some(event => event.remote && event.t === "thread.search" && event.query === "Remote pinned"));
  assert.ok(events.some(event => !event.remote && event.t === "thread.search" && event.query === "Remote pinned"));
  await sidebar.getByRole("textbox", { name: "Find a conversation" }).fill("");
  await remote.getByRole("button", { name: "Remote pinned", exact: true }).click();
  await page.waitForFunction(async () => (await import("/web/src/lib/environment.ts")).environmentId() === "ssh");
  assert.equal(await remote.locator(".thread-card").getAttribute("data-active"), "true");
  assert.equal(await local.locator(".thread-card").getAttribute("data-active"), "false");
  await remote.getByRole("button", { name: "Remote pinned", exact: true }).hover();
  await remote.getByRole("button", { name: "Delete Remote pinned" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete this conversation?" });
  await confirmation.getByText("Remote pinned", { exact: true }).waitFor();
  await confirmation.getByRole("button", { name: "Delete conversation" }).click();
  await remote.waitFor({ state: "detached" });
  assert.ok(events.some(event => event.remote && event.t === "thread.remove" && event.id === "same"));
  await local.waitFor();
  assert.deepEqual(errors, []);
});

test("disconnected SSH catalog threads appear in Pinned and Finished", { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-sidebar-cached-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), cacheDir: join(directory, "cache"), plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("citropy.sidebarMode", "global");
    localStorage.setItem("citropy.project", "project");
    localStorage.setItem("citropy.workspaces", JSON.stringify({ ssh: {
      home: "/remote",
      projects: [{ id: "project", name: "Remote project", path: "/remote/project", isGit: false, lastOpened: 1 }],
      threads: [
        { id: "cached-pin", projectId: "project", provider: "claude", title: "Cached pinned", updatedAt: 2, pinned: true },
        { id: "cached-done", projectId: "project", provider: "claude", title: "Cached finished", updatedAt: 1, finished: true },
      ],
    } }));
    window.citropyDesktop = {
      environmentsState: async () => ({ activeId: "local", endpoint: "", connections: [{ id: "ssh", name: "Build server", target: "build", port: 22, node: "node", status: "disconnected" }] }),
      onEnvironmentsState: () => () => {},
      onBrowserSelect: () => () => {},
    };
  });
  await page.routeWebSocket("**/socket", socket => {
    socket.send(JSON.stringify({ t: "hello", snapshot: {
      projects: [{ id: "project", name: "Local project", path: "/local/project", isGit: false, lastOpened: 1 }],
      threads: localThreads, providers: [], permissions: [], home: "/local",
    } }));
  });
  await page.goto(server.resolvedUrls.local[0]);
  const sidebar = page.locator('.rail[data-sidebar-mode="global"]');
  const pinned = sidebar.locator('.thread-category[data-category="pinned"]');
  await pinned.getByRole("button", { name: "Cached pinned", exact: true }).waitFor();
  assert.equal(await pinned.locator('.thread-entry[data-environment="ssh"][data-thread-id="cached-pin"] .thread-row-actions').count(), 0);
  const finished = sidebar.locator('.thread-category[data-category="finished"]');
  await finished.getByRole("button", { name: "Expand Finished" }).click();
  await finished.getByRole("button", { name: "Cached finished", exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
