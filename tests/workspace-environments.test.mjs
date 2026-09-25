import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("folder controls work across environments without entering a conversation", { timeout: 90000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-workspace-environments-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), plugins: [react()], logLevel: "error", cacheDir: join(directory, "cache"), server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  const commands = [];
  const requests = [];
  const sockets = new Map();
  let holdRemoteHello = false;
  let releaseRemoteHello;
  const remoteReconnect = Promise.withResolvers();
  const threads = { local: [], "ssh-test": [] };
  const projects = Object.fromEntries(["local", "ssh-test"].map(environment => [environment, ["shared", "second"].map((id, index) => ({ id, path: `/workspace/${id}`, name: `${environment === "local" ? "Local" : "Remote"} ${index + 1}`, isGit: false, lastOpened: 1 }))]));
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await browser.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await page.addInitScript(projects => {
    localStorage.setItem("citropy.sidebarMode", "global");
    localStorage.setItem("citropy.project", "shared");
    localStorage.setItem("citropy.inspector", "0");
    localStorage.setItem("citropy.theme", "dark");
    localStorage.setItem("citropy.workspaces", JSON.stringify(Object.fromEntries(Object.entries(projects).map(([id, entries]) => [id, { home: "/home", projects: entries, threads: [] }]))));
    let activeId = "local";
    let remoteStatus = "connected";
    const listeners = new Set();
    window.hostConnections = [];
    const state = () => ({ activeId, endpoint: activeId === "local" ? "" : "http://127.0.0.1:49121", connections: [{ id: "ssh-test", name: "Build server", target: "dev@build", port: 22, node: "node", status: remoteStatus, endpoint: "http://127.0.0.1:49121" }] });
    window.setRemoteStatus = status => { remoteStatus = status; for (const listener of listeners) listener(state()); };
    window.citropyDesktop = {
      environmentsState: async () => state(),
      onEnvironmentsState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      connectEnvironment: async id => {
        window.hostConnections.push(id);
        if (window.failConnection) throw new Error("Test SSH connection failed");
        activeId = id;
        for (const listener of listeners) listener(state());
        return state();
      },
      windowState: async () => ({ platform: "linux", maximized: false, fullscreen: false, development: true, version: "test", notifications: false }),
      onWindowState: () => () => {}, onNotification: () => () => {}, onBrowserSelect: () => () => {},
      updateState: async () => ({ status: "idle", version: "test" }), onUpdateState: () => () => {},
    };
  }, projects);
  await page.route("**/api/**", route => {
    const request = route.request();
    if (request.method() !== "OPTIONS") requests.push({ url: request.url(), method: request.method(), body: request.postData() });
    return route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "Content-Type" } });
  });
  await page.routeWebSocket("**/socket*", socket => {
    const environment = socket.url().includes(":49121/") ? "ssh-test" : "local";
    assert.equal(new URL(socket.url()).searchParams.has("workspace"), false);
    sockets.set(environment, socket);
    socket.onMessage(raw => {
      const event = JSON.parse(raw);
      commands.push({ environment, ...event });
      if (event.t === "thread.load") socket.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: [] }));
      if (event.t === "project.rename") {
        const project = projects[environment].find(project => project.id === event.id);
        project.name = event.name;
        socket.send(JSON.stringify({ t: "project.upsert", project }));
      }
      if (event.t === "project.close") {
        projects[environment] = projects[environment].filter(project => project.id !== event.id);
        socket.send(JSON.stringify({ t: "project.remove", id: event.id }));
      }
      if (event.t === "thread.finish") {
        const thread = threads[environment].find(thread => thread.id === event.id);
        if (thread) socket.send(JSON.stringify({ t: "thread.upsert", thread: { ...thread, finished: event.finished } }));
      }
      if (event.t === "thread.remove") {
        threads[environment] = threads[environment].filter(thread => thread.id !== event.id);
        socket.send(JSON.stringify({ t: "thread.remove", id: event.id }));
      }
    });
    const hello = () => socket.send(JSON.stringify({ t: "hello", snapshot: { projects: projects[environment], threads: threads[environment], providers: [], permissions: [], home: "/home" } }));
    if (environment === "ssh-test" && holdRemoteHello) { releaseRemoteHello = hello; remoteReconnect.resolve(); }
    else hello();
  });
  await page.goto(server.resolvedUrls.local[0]);
  const heading = (environment, id) => page.locator(`.global-project-heading[data-environment="${environment}"][data-project-id="${id}"]`);
  const edit = async (environment, id, label) => {
    await heading(environment, id).locator(".global-project-edit").click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const state = () => page.evaluate(async () => {
    const { environmentId } = await import("/web/src/lib/environment.ts");
    const { useApp } = await import("/web/src/lib/store.ts");
    return [environmentId(), useApp.getState().activeProjectId, useApp.getState().activeThreadId];
  });
  await heading("ssh-test", "shared").waitFor();
  await t.test("cached folders have the same menus and reorder without connecting", async () => {
    await heading("ssh-test", "second").click({ button: "right" });
    const menu = page.getByRole("menu");
    assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Open workspace", "Rename project", "Move up", "Move down", "Remove project"]);
    await menu.getByRole("menuitem", { name: "Move up", exact: true }).click();
    assert.deepEqual(await page.locator('.global-project-heading[data-environment="ssh-test"]').evaluateAll(nodes => nodes.map(node => node.dataset.projectId)), ["second", "shared"]);
    assert.deepEqual(await page.evaluate(() => window.hostConnections), []);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("citropy.globalProjectOrder.ssh-test"))), ["second", "shared"]);
    await heading("ssh-test", "shared").locator(".global-project-toggle").dragTo(heading("ssh-test", "second"), { targetPosition: { x: 45, y: 4 } });
    assert.deepEqual(await page.locator('.global-project-heading[data-environment="ssh-test"]').evaluateAll(nodes => nodes.map(node => node.dataset.projectId)), ["shared", "second"]);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("citropy.globalProjectOrder.ssh-test"))), ["shared", "second"]);
  });
  await t.test("remote folders can be renamed before any thread exists", async () => {
    const node = await heading("ssh-test", "shared").elementHandle();
    await edit("ssh-test", "shared", "Rename project");
    const dialog = page.getByRole("dialog", { name: "Rename project", exact: true });
    await dialog.getByRole("textbox").fill("Renamed remote");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await heading("ssh-test", "shared").getByText("Renamed remote", { exact: true }).waitFor();
    assert.equal(await node.evaluate(node => node.isConnected), true);
    assert.deepEqual(await state(), ["ssh-test", "shared", null]);
    assert.equal(projects.local[0].name, "Local 1");
    assert.ok(commands.some(event => event.t === "project.rename" && event.environment === "ssh-test"));
    for (const width of [1440, 620]) {
      await page.setViewportSize({ width, height: 900 });
      await heading("local", "shared").locator(".global-project-edit").click();
      await page.waitForFunction(() => { const menu = document.querySelector('[role="menu"]'); return menu && Number(getComputedStyle(menu).opacity) > 0.99; });
      await page.screenshot({ path: `/tmp/citropy-folder-parity-${width}.png`, animations: "disabled" });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await t.test("inactive local folders have the same actions and collapse state stays isolated", async () => {
    await heading("ssh-test", "shared").locator(".global-project-toggle").click();
    assert.equal(await heading("local", "shared").locator(".global-project-toggle").getAttribute("aria-expanded"), "true");
    await edit("local", "shared", "Open workspace");
    await page.waitForFunction(async () => (await import("/web/src/lib/environment.ts")).environmentId() === "local");
    assert.deepEqual(await state(), ["local", "shared", null]);
    assert.equal(await heading("ssh-test", "shared").locator(".global-project-toggle").getAttribute("aria-expanded"), "false");
    await edit("local", "shared", "Rename project");
    const dialog = page.getByRole("dialog", { name: "Rename project", exact: true });
    await dialog.getByRole("textbox").fill("Renamed local");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await heading("local", "shared").getByText("Renamed local", { exact: true }).waitFor();
    assert.equal(projects["ssh-test"][0].name, "Renamed remote");
  });
  await t.test("failed connections leave folders unchanged and removal targets the correct host", async () => {
    await page.evaluate(() => { window.failConnection = true; });
    await edit("ssh-test", "second", "Rename project");
    await page.getByText("Test SSH connection failed", { exact: true }).waitFor();
    assert.deepEqual(await state(), ["local", "shared", null]);
    assert.equal(await page.getByRole("dialog", { name: "Rename project", exact: true }).count(), 0);
    await page.evaluate(() => { window.failConnection = false; });
    const connections = await page.evaluate(() => window.hostConnections.length);
    await edit("ssh-test", "second", "Remove project");
    await Promise.all([
      page.waitForRequest(request => request.method() === "DELETE" && request.url() === "http://127.0.0.1:49121/api/projects?projectId=second"),
      page.getByRole("dialog", { name: "Remove project?", exact: true }).getByRole("button", { name: "Remove project", exact: true }).click(),
    ]);
    projects["ssh-test"] = projects["ssh-test"].filter(project => project.id !== "second");
    sockets.get("ssh-test").send(JSON.stringify({ t: "project.remove", id: "second" }));
    await heading("ssh-test", "second").waitFor({ state: "detached" });
    assert.ok(projects.local.some(project => project.id === "second"));
    assert.equal(await page.evaluate(() => window.hostConnections.length), connections);
    assert.deepEqual(await state(), ["local", "shared", null]);
  });
  await t.test("the workspace picker removes folders from any host", async () => {
    const added = { id: "picker-folder", name: "Picker folder", path: "/workspace/picker", isGit: false, lastOpened: 3 };
    projects["ssh-test"].push(added);
    sockets.get("ssh-test").send(JSON.stringify({ t: "project.upsert", project: added }));
    await heading("ssh-test", added.id).waitFor();
    await page.getByRole("button", { name: "Add project", exact: true }).click();
    const menu = page.getByRole("menu");
    if (await menu.getByRole("menuitem", { name: "Picker folder" }).count() === 0) await menu.getByRole("menuitem", { name: "Build server" }).click();
    await Promise.all([
      page.waitForRequest(request => request.method() === "DELETE" && request.url() === "http://127.0.0.1:49121/api/projects?projectId=picker-folder"),
      (async () => {
        await menu.getByRole("button", { name: "Remove project Picker folder", exact: true }).click();
        await page.getByRole("dialog", { name: "Remove project?", exact: true }).getByRole("button", { name: "Remove project", exact: true }).click();
      })(),
    ]);
    sockets.get("ssh-test").send(JSON.stringify({ t: "project.remove", id: added.id }));
    await heading("ssh-test", added.id).waitFor({ state: "detached" });
    assert.deepEqual(await state(), ["local", "shared", null]);
  });
  assert.ok(!commands.some(event => ["thread.load", "thread.create", "thread.send"].includes(event.t)));
  await t.test("inactive hosts keep live activity", async () => {
    await edit("ssh-test", "shared", "Open workspace");
    await page.waitForFunction(async () => (await import("/web/src/lib/environment.ts")).environmentId() === "ssh-test");
    const thread = environment => ({ id: "same-thread", projectId: "shared", provider: "codex", title: `${environment} task`, createdAt: 1, updatedAt: 1, status: "working", running: true, model: "test", permissionMode: "full", usage: {}, unread: false });
    threads.local.push(thread("local"));
    threads["ssh-test"].push(thread("ssh-test"));
    sockets.get("local").send(JSON.stringify({ t: "thread.upsert", thread: threads.local[0] }));
    sockets.get("ssh-test").send(JSON.stringify({ t: "thread.upsert", thread: threads["ssh-test"][0] }));
    const row = environment => page.locator(`.thread-entry[data-environment="${environment}"][data-thread-id="same-thread"]`);
    await row("local").getByRole("img", { name: "Working", exact: true }).waitFor();
    if (await heading("ssh-test", "shared").locator(".global-project-toggle").getAttribute("aria-expanded") === "false")
      await heading("ssh-test", "shared").locator(".global-project-toggle").click();
    await row("ssh-test").getByRole("img", { name: "Working", exact: true }).waitFor();
    threads.local[0] = { ...threads.local[0], status: "awaiting", running: false, title: "Local waiting" };
    sockets.get("local").send(JSON.stringify({ t: "thread.upsert", thread: threads.local[0] }));
    await row("local").getByRole("img", { name: "Needs input", exact: true }).waitFor();
    await row("local").getByText("Local waiting", { exact: true }).waitFor();
    await row("ssh-test").getByRole("img", { name: "Working", exact: true }).waitFor();
    assert.deepEqual(await state(), ["ssh-test", "shared", "same-thread"]);
    await edit("local", "shared", "Open workspace");
    await row("local").getByRole("img", { name: "Needs input", exact: true }).waitFor();
    await row("ssh-test").getByRole("img", { name: "Working", exact: true }).waitFor();
    holdRemoteHello = true;
    sockets.get("ssh-test").close();
    await row("ssh-test").getByRole("img", { name: "Disconnected", exact: true }).waitFor();
    await remoteReconnect.promise;
    holdRemoteHello = false;
    releaseRemoteHello();
    await row("ssh-test").getByRole("img", { name: "Working", exact: true }).waitFor();
    threads["ssh-test"][0] = { ...threads["ssh-test"][0], status: "error", running: false };
    sockets.get("ssh-test").send(JSON.stringify({ t: "thread.upsert", thread: threads["ssh-test"][0] }));
    await row("ssh-test").getByRole("img", { name: "Failed", exact: true }).waitFor();
    for (let index = 0; index < 20; index++) sockets.get("ssh-test").send(JSON.stringify({ t: "thread.upsert", thread: { ...threads["ssh-test"][0], updatedAt: index, usage: { outputTokens: index } } }));
    sockets.get("ssh-test").send(JSON.stringify({ t: "term.data", id: "terminal", data: "Background terminal output" }));
    sockets.get("ssh-test").send(JSON.stringify({ t: "thread.upsert", thread: { ...threads["ssh-test"][0], id: "child", parentThreadId: "same-thread", title: "Background child" } }));
    assert.deepEqual(await state(), ["local", "shared", "same-thread"]);
    const added = { id: "new-folder", name: "Created remotely", path: "/workspace/new", isGit: false, lastOpened: 2 };
    sockets.get("ssh-test").send(JSON.stringify({ t: "project.upsert", project: added }));
    await heading("ssh-test", added.id).getByText(added.name, { exact: true }).waitFor();
    assert.equal(await page.getByText("Background terminal output", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Background child", { exact: true }).count(), 0);
    sockets.get("ssh-test").send(JSON.stringify({ t: "project.remove", id: added.id }));
    await heading("ssh-test", added.id).waitFor({ state: "detached" });
    await page.evaluate(() => window.setRemoteStatus("disconnected"));
    await row("ssh-test").getByRole("img", { name: "Disconnected", exact: true }).waitFor();
    assert.equal(await row("ssh-test").getByRole("img", { name: "Failed", exact: true }).count(), 0);
    threads["ssh-test"][0] = { ...threads["ssh-test"][0], status: "idle" };
    await page.evaluate(() => window.setRemoteStatus("connected"));
    await row("ssh-test").getByRole("img", { name: "Disconnected", exact: true }).waitFor({ state: "detached" });
    assert.equal(await row("ssh-test").locator(".thread-status").count(), 0);
    sockets.get("ssh-test").send(JSON.stringify({ t: "thread.remove", id: "same-thread" }));
    await row("ssh-test").waitFor({ state: "detached" });
    assert.equal(await row("local").count(), 1);
  });
  await t.test("threads on an inactive host can be edited without switching to it", async () => {
    const remote = { id: "remote-thread", projectId: "shared", provider: "codex", title: "Remote task", createdAt: 1, updatedAt: 1, status: "idle", running: false };
    sockets.get("ssh-test").send(JSON.stringify({ t: "thread.upsert", thread: remote }));
    const row = page.locator('.thread-entry[data-environment="ssh-test"][data-thread-id="remote-thread"]');
    const connections = await page.evaluate(() => window.hostConnections.length);
    await row.waitFor();
    const sent = (method, path) => requests.find(request => request.method === method && request.url.startsWith(`http://127.0.0.1:49121/api/${path}`));
    await row.hover();
    await row.getByRole("button", { name: "Organize Remote task", exact: true }).click();
    await page.getByRole("menuitem", { name: "Rename…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rename conversation", exact: true });
    await dialog.getByRole("textbox").fill("Renamed remote task");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(JSON.parse(sent("PATCH", "threads/organize?threadId=remote-thread").body), { title: "Renamed remote task" });
    await row.hover();
    await row.getByRole("button", { name: "Finish Remote task", exact: true }).click();
    assert.ok(commands.some(event => event.environment === "ssh-test" && event.t === "thread.finish" && event.id === "remote-thread" && event.finished));
    await row.hover();
    await row.getByRole("button", { name: "Delete Remote task", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete conversation", exact: true }).click();
    assert.ok(commands.some(event => event.environment === "ssh-test" && event.t === "thread.remove" && event.id === "remote-thread"));
    assert.deepEqual(await state(), ["local", "shared", "same-thread"]);
    assert.equal(await page.evaluate(() => window.hostConnections.length), connections);
  });
  assert.ok(!commands.some(event => ["thread.create", "thread.send"].includes(event.t)));
  assert.deepEqual(errors, []);
});
