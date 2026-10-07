import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { chromium } from "playwright";
import { serveStatic } from "../server/static.ts";

const root = new URL("../dist/", import.meta.url);
const assets = await readdir(new URL("assets/", root));
assert.ok(assets.some(name => name.endsWith(".br")), "production build must include compressed assets");
for (const name of assets.filter(name => /\.(br|gz)$/.test(name))) {
  const original = await readFile(new URL(`assets/${name.replace(/\.(br|gz)$/, "")}`, root));
  const compressed = await readFile(new URL(`assets/${name}`, root));
  assert.ok(original.equals((name.endsWith(".br") ? brotliDecompressSync : gunzipSync)(compressed)), `compressed asset differs from final output: ${name}`);
}
const server = createServer((req, res) => {
  if (!serveStatic(fileURLToPath(root), req.url, res)) res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const appUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
const project = { id: "project", name: "Performance fixture", path: "/fixture", isGit: false, lastOpened: 1 };
const picture = await readFile(new URL("./fixtures/editor-preview.png", import.meta.url));

async function fixture(panels, threads = [], width = 1600) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  const requests = [];
  const compressedResponses = [];
  const javascriptResponses = [];
  let connection;
  let terminalReplayBytes = 0;
  const terminalOutput = Array.from({ length: 500 }, (_, index) => `\u001b[32m${index}\u001b[0m ${"Terminal output ".repeat(8)}\r\n`).join("");
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("request", (request) => requests.push(request.url()));
  page.on("response", response => {
    if (/^(br|gzip)$/.test(response.headers()["content-encoding"] ?? "")) compressedResponses.push(response.url());
    if (response.url().endsWith(".js")) javascriptResponses.push({ file: new URL(response.url()).pathname.split("/").at(-1), bytes: Number(response.headers()["content-length"] ?? 0) });
  });
  await page.addInitScript((threadId) => {
    if (threadId) localStorage.setItem("citropy.thread", threadId);
    localStorage.setItem("citropy.project", "project");
    localStorage.setItem("citropy.inspector", "1");
    localStorage.setItem("citropy.theme", "dark");
    localStorage.setItem("citropy.uiScale", "100");
  }, threads.at(-1)?.id);
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/editor/tree") return route.fulfill({ json: ["hello.ts", "diagram.png"].map((name) => ({ path: name, name, dir: false })) });
    if (url.pathname === "/api/editor/file") return route.fulfill({ json: { text: 'export const greeting = "Hello";\n', revision: "a".repeat(64) } });
    if (url.pathname === "/api/preview") return route.fulfill({ json: { path: "diagram.png", name: "diagram.png", mime: "image/png", size: picture.length } });
    if (url.pathname === "/api/assets") return route.fulfill({ contentType: "image/png", body: picture });
    if (url.pathname === "/api/agents") return route.fulfill({ json: { agents: [] } });
    return route.fulfill({ json: {} });
  });
  await page.routeWebSocket("**/socket*", (socket) => {
    connection = socket;
    socket.onMessage((raw) => {
      const event = JSON.parse(raw);
      if (event.t === "term.open") {
        const resumed = event.sessionId === event.termId && Number.isSafeInteger(event.offset) && event.offset >= 0 && event.offset <= terminalOutput.length;
        const data = resumed ? terminalOutput.slice(event.offset) : terminalOutput;
        terminalReplayBytes += Buffer.byteLength(data);
        socket.send(JSON.stringify({ t: "term.data", termId: event.termId, reset: !resumed, data, offset: terminalOutput.length, sessionId: event.termId }));
      }
      if (event.t === "thread.load") socket.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: [] }));
    });
    socket.send(JSON.stringify({ t: "hello", snapshot: { projects: [project], threads, providers: [], permissions: [], home: "/fixture", panels } }));
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(appUrl);
  await page.getByRole("button", { name: "Expand workspace", exact: true }).waitFor();
  assert.ok(compressedResponses.some(url => url.endsWith(".js")), "production JavaScript must use negotiated compression");
  const metrics = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const entries = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
    return {
      heapMiB: entries.JSHeapUsedSize / 1024 / 1024,
      taskMs: entries.TaskDuration * 1000,
      layoutMs: entries.LayoutDuration * 1000,
      styleMs: entries.RecalcStyleDuration * 1000,
      domNodes: (await cdp.send("Memory.getDOMCounters")).nodes,
      terminalCanvases: await page.locator(".term canvas").count(),
      terminalReplayBytes,
    };
  };
  return { page, connection, metrics, requests, errors, javascriptResponses };
}

try {
  const idle = await fixture([]);
  await idle.page.waitForTimeout(2700);
  const secondary = idle.requests.filter(url => /\/(GitHub|GitManager|Settings|UsageView)-[^/]+\.js$/.test(url));
  console.log(JSON.stringify({ scenario: "idle chat feature loading", secondary: secondary.map(url => new URL(url).pathname.split("/").at(-1)), javascriptBytes: idle.javascriptResponses.reduce((total, entry) => total + entry.bytes, 0), javascriptRequests: idle.javascriptResponses.length, ...await idle.metrics() }));
  assert.deepEqual(secondary, [], "unused screens must remain deferred after startup");
  assert.equal(idle.requests.some(url => /\/(DrawingPane|NotesPane)-[^/]+\.js$/.test(url)), false);
  await idle.page.locator(".account-menu-button").click();
  await idle.page.getByRole("button", { name: "Settings", exact: true }).click();
  await idle.page.getByRole("heading", { name: "General", exact: true }).waitFor();
  assert.equal(idle.requests.some(url => /\/Settings-[^/]+\.js$/.test(url)), true);
  assert.equal(idle.requests.some(url => /\/(GitHub|GitManager|UsageView)-[^/]+\.js$/.test(url)), false);
  assert.deepEqual(idle.errors, []);
  await idle.page.close();

  for (const width of [1600, 380]) {
    const creative = await fixture([{ id: "drawing", projectId: "project", kind: "drawing", title: "Drawing" }, { id: "notes", projectId: "project", kind: "notes", title: "Notes" }], [], width);
    await creative.page.locator(".drawing-ink").waitFor();
    assert.equal(creative.requests.some(url => /\/DrawingPane-[^/]+\.js$/.test(url)), true);
    assert.equal(creative.requests.some(url => /\/NotesPane-[^/]+\.js$/.test(url)), true);
    const canvas = await creative.page.locator(".drawing-ink").boundingBox();
    await creative.page.mouse.move(canvas.x + 40, canvas.y + 40);
    await creative.page.mouse.down();
    await creative.page.mouse.move(canvas.x + 120, canvas.y + 70, { steps: 5 });
    await creative.page.mouse.up();
    assert.equal(await creative.page.getByRole("button", { name: "Undo", exact: true }).isEnabled(), true);
    await creative.page.getByRole("tab", { name: "Notes", exact: true }).click();
    await creative.page.getByRole("button", { name: /^Blank note/ }).click();
    await creative.page.getByRole("textbox", { name: "Note title", exact: true }).fill("Preserved draft");
    await creative.page.getByRole("textbox", { name: "Note", exact: true }).fill("A persistent note body.");
    await creative.page.getByRole("button", { name: "Preview", exact: true }).click();
    await creative.page.getByRole("tab", { name: "Drawing", exact: true }).click();
    assert.equal(await creative.page.getByRole("button", { name: "Undo", exact: true }).isEnabled(), true);
    await creative.page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await creative.page.getByRole("button", { name: "Redo", exact: true }).isEnabled(), true);
    await creative.page.getByRole("tab", { name: "Notes", exact: true }).click();
    assert.equal(await creative.page.getByRole("textbox", { name: "Note title", exact: true }).inputValue(), "Preserved draft");
    assert.equal(await creative.page.getByRole("button", { name: "Preview", exact: true }).getAttribute("aria-pressed"), "true");
    await creative.page.locator(".note-body p").filter({ hasText: "A persistent note body." }).waitFor();
    assert.equal(await creative.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await creative.page.screenshot({ path: `/tmp/citropy-lazy-panels-${width}.png` });
    console.log(JSON.stringify({ scenario: `lazy drawing and notes at ${width}px`, ...await creative.metrics() }));
    assert.deepEqual(creative.errors, []);
    await creative.page.close();
  }

  const files = await fixture([{ id: "files", projectId: "project", kind: "files", title: "Files" }]);
  await files.page.getByRole("button", { name: "hello.ts", exact: true }).waitFor();
  await files.page.waitForTimeout(300);
  assert.equal(files.requests.some(url => /\/monaco-.*\.js/.test(url)), false);
  console.log(JSON.stringify({ scenario: "files before opening code", ...await files.metrics() }));
  await files.page.getByRole("button", { name: "diagram.png", exact: true }).click();
  await files.page.locator(".editor-document img").waitFor();
  assert.equal(files.requests.some(url => /\/monaco-.*\.js/.test(url)), false);
  console.log(JSON.stringify({ scenario: "image preview", ...await files.metrics() }));
  await files.page.getByRole("button", { name: "hello.ts", exact: true }).click();
  await files.page.locator(".view-lines").waitFor();
  assert.equal(files.requests.some(url => /\/monaco-.*\.js/.test(url)), true);
  await files.page.waitForTimeout(500);
  console.log(JSON.stringify({ scenario: "code editor", ...await files.metrics() }));
  assert.deepEqual(files.errors, []);
  await files.page.close();

  const panels = Array.from({ length: 8 }, (_, index) => ({ id: `terminal-${index}`, projectId: "project", kind: "terminal", title: `Terminal ${index + 1}` }));
  const terminals = await fixture(panels);
  await terminals.page.getByRole("button", { name: "Expand workspace", exact: true }).click();
  for (const panel of panels) {
    await terminals.page.getByRole("tab", { name: panel.title, exact: true }).click();
    await terminals.page.locator(`#panel-body-${panel.id} .xterm-screen canvas`).last().waitFor();
    await terminals.page.waitForTimeout(150);
  }
  console.log(JSON.stringify({ scenario: "eight visited terminal tabs", ...await terminals.metrics() }));
  await terminals.page.waitForTimeout(250);
  const beforeSwitch = await terminals.metrics();
  for (let pass = 0; pass < 3; pass++) {
    for (const panel of panels) {
      await terminals.page.getByRole("tab", { name: panel.title, exact: true }).click();
      await terminals.page.waitForTimeout(50);
    }
  }
  const afterSwitch = await terminals.metrics();
  const replayBytes = afterSwitch.terminalReplayBytes - beforeSwitch.terminalReplayBytes;
  assert.equal(replayBytes, 0, "unchanged terminal tabs must resume without replaying their existing output");
  console.log(JSON.stringify({ scenario: "24 terminal switches", taskMs: afterSwitch.taskMs - beforeSwitch.taskMs, heapMiB: afterSwitch.heapMiB, terminalCanvases: afterSwitch.terminalCanvases, replayBytes }));
  console.log(JSON.stringify({ scenario: "terminal errors", errors: terminals.errors }));
  await terminals.page.close();

  const threads = Array.from({ length: 500 }, (_, index) => ({
    id: `thread-${index}`, projectId: "project", title: `Conversation ${index}`, provider: "codex", model: "model", permissionMode: "manual",
    status: "idle", running: false, createdAt: index + 1, updatedAt: index + 1,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0 },
  }));
  const chat = await fixture([{ id: "tools", projectId: "project", kind: "tools", title: "Tools" }], threads);
  await chat.page.waitForTimeout(500);
  const backgroundBefore = await chat.metrics();
  for (let index = 0; index < 120; index++) {
    const thread = threads[index % 100];
    chat.connection.send(JSON.stringify({ t: "thread.upsert", thread: { ...thread, updatedAt: Date.now(), activeTool: `Reading ${index}`, usage: { ...thread.usage, input: index, output: index } } }));
    await chat.page.waitForTimeout(16);
  }
  await chat.page.waitForTimeout(200);
  const backgroundAfter = await chat.metrics();
  console.log(JSON.stringify({ scenario: "120 background thread updates", taskMs: backgroundAfter.taskMs - backgroundBefore.taskMs, layoutMs: backgroundAfter.layoutMs - backgroundBefore.layoutMs, styleMs: backgroundAfter.styleMs - backgroundBefore.styleMs, heapMiB: backgroundAfter.heapMiB }));
  chat.connection.send(JSON.stringify({ t: "thread.upsert", thread: { ...threads.at(-1), updatedAt: Date.now() } }));
  await chat.page.waitForTimeout(200);
  const sidebar = chat.page.locator(".rail-list");
  await sidebar.evaluate(element => { element.scrollTop = 500; });
  await chat.page.waitForTimeout(150);
  const scrollTop = await sidebar.evaluate(element => element.scrollTop);
  const before = await chat.metrics();
  for (let index = 0; index < 120; index++) {
    const thread = threads.at(-1);
    chat.connection.send(JSON.stringify({ t: "thread.upsert", thread: { ...thread, updatedAt: Date.now(), activeTool: `Reading ${index}`, usage: { ...thread.usage, input: index, output: index } } }));
    await chat.page.waitForTimeout(16);
  }
  await chat.page.waitForTimeout(200);
  const after = await chat.metrics();
  console.log(JSON.stringify({ scenario: "120 active thread updates with stable sidebar order", taskMs: after.taskMs - before.taskMs, layoutMs: after.layoutMs - before.layoutMs, styleMs: after.styleMs - before.styleMs, heapMiB: after.heapMiB }));
  assert.ok(Math.abs(await sidebar.evaluate(element => element.scrollTop) - scrollTop) < 2, "timestamp updates with unchanged row keys must preserve the sidebar reading position");
  await sidebar.evaluate(element => { element.scrollTop = 0; });
  const added = { ...threads.at(-1), id: "thread-added", title: "Added conversation", createdAt: Date.now(), updatedAt: Date.now() + 1000 };
  chat.connection.send(JSON.stringify({ t: "thread.upsert", thread: added }));
  await chat.page.getByRole("button", { name: added.title, exact: true }).waitFor();
  chat.connection.send(JSON.stringify({ t: "thread.remove", id: added.id }));
  await chat.page.getByRole("button", { name: added.title, exact: true }).waitFor({ state: "detached" });
  chat.connection.send(JSON.stringify({ t: "thread.upsert", thread: { ...threads.at(-1), updatedAt: Date.now(), pinned: true } }));
  await chat.page.locator('[data-category="pinned"] [data-thread-id="thread-499"]').waitFor();
  await chat.page.screenshot({ path: "/tmp/citropy-sidebar-virtualizer-1600.png" });
  assert.deepEqual(chat.errors, []);
  await chat.page.close();
  const narrow = await fixture([], threads, 380);
  await narrow.page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  const narrowSidebar = narrow.page.locator(".rail-list");
  await narrow.page.getByRole("button", { name: "Conversation 499", exact: true }).waitFor();
  await narrowSidebar.evaluate(element => { element.scrollTop = 500; });
  await narrow.page.waitForTimeout(150);
  const narrowScroll = await narrowSidebar.evaluate(element => element.scrollTop);
  narrow.connection.send(JSON.stringify({ t: "thread.upsert", thread: { ...threads.at(-1), title: "Updated conversation", updatedAt: Date.now(), activeTool: "Reading", usage: { ...threads.at(-1).usage, input: 100 } } }));
  await narrow.page.getByRole("button", { name: "Updated conversation", exact: true }).waitFor({ state: "attached" });
  await narrow.page.waitForTimeout(100);
  assert.ok(Math.abs(await narrowSidebar.evaluate(element => element.scrollTop) - narrowScroll) < 2);
  await narrow.page.screenshot({ path: "/tmp/citropy-sidebar-virtualizer-380.png" });
  assert.deepEqual(narrow.errors, []);
  await narrow.page.close();
  assert.deepEqual(terminals.errors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
