import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const projects = [
  { id: "first", name: "First workspace", path: "/example/first", isGit: false, lastOpened: 2 },
  { id: "second", name: "Second workspace", path: "/example/second", isGit: false, lastOpened: 1 },
];
const thread = { id: "first-chat", projectId: "first", provider: "claude", model: "claude-fast", title: "First project task", permissionMode: "manual", status: "idle", running: false, createdAt: 1, updatedAt: 2, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, contextTokens: 0, contextMax: 200000, turns: 0 } };
const secondThread = { ...thread, id: "second-chat", projectId: "second", provider: "codex", model: "codex-fast", title: "Second project task", updatedAt: 1 };
const pinnedThread = { ...thread, id: "pinned-chat", title: "Pinned project task", pinned: true, updatedAt: 3 };
const finishedThread = { ...thread, id: "finished-chat", title: "Finished project task", finished: true, updatedAt: 1 };
const providers = [
  { id: "claude", label: "Claude Code", available: true, enabled: true, models: [{ id: "claude-fast", label: "Claude Fast", isDefault: true }] },
  { id: "codex", label: "Codex", available: true, enabled: true, models: [{ id: "codex-fast", label: "Codex Fast", isDefault: true }] },
];

test("sidebar mode shows compact conversations across open projects", { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-sidebar-mode-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), cacheDir: join(directory, "cache"), plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({ project: "first", thread: "first-chat", sidebar: "1", inspector: "0", theme: "dark", uiScale: "100" })) localStorage.setItem(`citropy.${key}`, value);
    localStorage.setItem("citropy.sidebarMode", localStorage.getItem("citropy.sidebarMode") ?? "workspaces");
  });
  const created = [];
  const events = [];
  await page.route("**/api/threads", route => {
    const input = route.request().postDataJSON();
    created.push(input);
    return route.fulfill({ json: { ...thread, ...input, id: "new-chat", title: "New thread" } });
  });
  await page.routeWebSocket("**/socket", socket => {
    socket.onMessage(raw => {
      const event = JSON.parse(raw);
      events.push(event);
      if (event.t === "thread.load") socket.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: [] }));
      if (event.t === "thread.finish") {
        const current = [thread, secondThread, pinnedThread, finishedThread].find(entry => entry.id === event.id);
        socket.send(JSON.stringify({ t: "thread.upsert", thread: { ...current, finished: event.finished } }));
      }
      if (event.t === "github.request") socket.send(JSON.stringify({ t: "github.result", requestId: event.requestId, result: { installed: false, repositories: [] } }));
      if (event.t === "project.rename") {
        const project = projects.find(entry => entry.id === event.id);
        project.name = event.name;
        socket.send(JSON.stringify({ t: "project.upsert", project }));
      }
      if (event.t === "project.close") socket.send(JSON.stringify({ t: "project.remove", id: event.id }));
    });
    socket.send(JSON.stringify({ t: "hello", snapshot: { projects, threads: [thread, secondThread, pinnedThread, finishedThread], providers, permissions: [], home: "/example" } }));
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('.rail[data-sidebar-mode="workspaces"]').waitFor();
  const checkContextMenu = async title => {
    const row = page.getByRole('button', { name: title, exact: true });
    const selected = await page.evaluate(async () => (await import('/web/src/lib/store.ts')).useApp.getState().activeThreadId);
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename…', exact: true }).waitFor();
    assert.equal(await page.evaluate(async () => (await import('/web/src/lib/store.ts')).useApp.getState().activeThreadId), selected);
    await row.click({ button: 'right' });
    assert.equal(await page.getByRole('menu').count(), 1);
    await page.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename conversation', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('textbox').inputValue(), title);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await row.focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Rename…', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: `Organize ${title}`, exact: true }).evaluate(node => node === document.activeElement), true);
  };
  await checkContextMenu('Pinned project task');
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('button[data-settings-section="application"]').click();
  const mode = page.getByLabel("Sidebar mode");
  assert.equal(await mode.inputValue(), "workspaces");
  await mode.selectOption("global");
  assert.equal(await page.evaluate(() => localStorage.getItem("citropy.sidebarMode")), "global");
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  const sidebar = page.locator('.rail[data-sidebar-mode="global"]');
  const second = sidebar.locator('.thread-category[data-category="project:second"]');
  await second.getByRole("button", { name: "Second project task", exact: true }).waitFor();
  await checkContextMenu('Second project task');
  assert.equal(await page.locator('.topbar .workspace-select').count(), 0);
  assert.equal(await page.locator('.topbar .breadcrumb-separator').count(), 0);
  assert.equal(await sidebar.locator('.thread-category').first().getAttribute('data-category'), 'pinned');
  const pinned = sidebar.locator('.thread-category[data-category="pinned"]');
  assert.equal(await pinned.locator('.thread-row').count(), 1);
  assert.equal(await pinned.locator('.global-project-toggle .lucide-pin').count(), 1);
  await pinned.getByRole('button', { name: 'Collapse Pinned' }).click();
  await pinned.locator('.thread-row').waitFor({ state: 'detached' });
  assert.equal(await pinned.locator('.global-project-toggle .lucide-pin').count(), 1);
  await pinned.getByRole('button', { name: 'Expand Pinned' }).click();
  await pinned.locator('.thread-row').waitFor();
  assert.equal(await sidebar.locator('.thread-category[data-category="project:first"] .thread-row').count(), 1);
  const first = sidebar.locator('.thread-category[data-category="project:first"]');
  const finished = sidebar.locator('.thread-category[data-category="finished"]');
  assert.equal(await sidebar.locator('.thread-category').last().getAttribute('data-category'), 'finished');
  assert.equal(await finished.locator('.thread-row').count(), 0);
  await finished.getByRole('button', { name: 'Expand Finished' }).click();
  await finished.getByRole('button', { name: 'Finished project task', exact: true }).waitFor();
  await first.getByRole('button', { name: 'First project task', exact: true }).hover();
  await first.getByRole('button', { name: 'Finish First project task' }).click();
  await finished.getByRole('button', { name: 'First project task', exact: true }).waitFor();
  assert.equal(await first.locator('.thread-row').count(), 0);
  await finished.getByRole('button', { name: 'First project task', exact: true }).hover();
  await finished.getByRole('button', { name: 'Reopen First project task' }).click();
  await first.getByRole('button', { name: 'First project task', exact: true }).waitFor();
  assert.equal(await finished.locator('.thread-row').count(), 1);
  assert.ok(events.some(event => event.t === 'thread.finish' && event.id === 'first-chat' && event.finished));
  assert.ok(events.some(event => event.t === 'thread.finish' && event.id === 'first-chat' && !event.finished));
  assert.equal(await sidebar.getByRole("button", { name: "New thread", exact: true }).count(), 0);
  await sidebar.getByRole("button", { name: "Add project" }).click();
  await page.getByRole("menuitem", { name: /First workspace/ }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await sidebar.locator(".thread-row-footer").count(), 0);
  assert.ok((await second.locator(".thread-row").boundingBox()).height < 40);
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `/tmp/citropy-global-sidebar-${width}.png`, animations: "disabled" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await sidebar.waitFor();
  const secondRow = second.getByRole("button", { name: "Second project task", exact: true });
  await secondRow.hover();
  const preview = page.locator('.thread-preview[role="tooltip"]');
  await preview.waitFor();
  assert.match(await preview.innerText(), /Codex Fast/);
  assert.match(await preview.innerText(), /second/);
  await page.mouse.move(600, 400);
  await preview.waitFor({ state: "detached" });
  await secondRow.click();
  assert.deepEqual(await page.evaluate(async () => {
    const { useApp } = await import("/web/src/lib/store.ts");
    return [useApp.getState().activeProjectId, useApp.getState().activeThreadId];
  }), ["second", "second-chat"]);
  assert.equal(await second.locator('.global-project-toggle .lucide-folder-open').count(), 1);
  await second.getByRole("button", { name: "Collapse Second workspace" }).click();
  await second.locator(".thread-row").waitFor({ state: "detached" });
  assert.equal(await second.locator('.global-project-toggle .lucide-folder').count(), 1);
  await second.getByRole("button", { name: "Expand Second workspace" }).click();
  await second.getByRole("button", { name: "Second project task", exact: true }).waitFor();
  await sidebar.locator('.thread-category[data-category="project:first"] .global-project-toggle').dragTo(second.locator('.global-project-heading'), { targetPosition: { x: 40, y: 30 } });
  assert.equal(await sidebar.locator('.thread-category').nth(1).getAttribute('data-category'), 'project:second');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('citropy.globalProjectOrder.local'))), ['second', 'first']);
  await page.reload();
  await sidebar.waitFor();
  assert.equal(await sidebar.locator('.thread-category').nth(1).getAttribute('data-category'), 'project:second');
  await second.getByRole('button', { name: 'Edit project Second workspace' }).click();
  await page.getByRole('menuitem', { name: 'Rename project' }).click();
  await page.getByRole('dialog', { name: 'Rename project' }).getByRole('textbox').fill('Renamed workspace');
  await page.getByRole('dialog', { name: 'Rename project' }).getByRole('button', { name: 'Save' }).click();
  await second.getByRole('button', { name: 'Collapse Renamed workspace' }).waitFor();
  assert.ok(events.some(event => event.t === 'project.rename' && event.id === 'second' && event.name === 'Renamed workspace'));
  const response = page.waitForResponse(value => value.url().endsWith("/api/threads") && value.request().method() === "POST");
  await sidebar.getByRole("button", { name: "New thread · First workspace" }).click();
  await response;
  assert.equal(created[0].projectId, "first");
  await second.getByRole('button', { name: 'Edit project Renamed workspace' }).click();
  await page.getByRole('menuitem', { name: 'Remove project' }).click();
  await page.getByRole('dialog', { name: 'Remove project?' }).waitFor();
  await page.getByRole('dialog', { name: 'Remove project?' }).getByRole('button', { name: 'Remove project' }).click();
  await second.waitFor({ state: 'detached' });
  assert.ok(events.some(event => event.t === 'project.close' && event.id === 'second'));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('button[data-settings-section="application"]').click();
  await page.getByLabel("Sidebar mode").selectOption("workspaces");
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  await page.locator('.rail[data-sidebar-mode="workspaces"] .thread-category[data-category="active"]').waitFor();
  assert.equal(await page.locator('.rail .global-project-heading').count(), 0);
  assert.equal(await page.locator('.topbar .workspace-select').count(), 1);
  assert.equal(await page.locator('.rail .new-thread').count(), 1);
  assert.deepEqual(errors, []);
});
