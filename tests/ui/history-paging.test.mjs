import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { waitUntil } from "./wait-until.mjs";

const messages = (start, count) => Array.from({ length: count }, (_, offset) => {
  const index = start + offset;
  return { id: `m${index}`, role: index % 2 ? "assistant" : "user", ts: index, parts: [{ id: `p${index}`, kind: "text", text: `Message ${index}. ` + "A paragraph with different measured heights. ".repeat(8 + index % 7), complete: true }] };
});

test("conversation history paging", { timeout: 120_000 }, async t => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-history-tests`, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  let sequence = 0;
  async function fixture(t, width = 1280, shell = false, paging = true) {
    const context = await browser.newContext({ viewport: { width, height: 860 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const requests = [];
    const sent = [];
    let live;
    let wireSequence = 0;
    const push = event => live.send(JSON.stringify({ t: "event.batch", after: wireSequence, sequence: ++wireSequence, events: [event] }));
    page.on("pageerror", error => errors.push(error.message));
    t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
    await page.routeWebSocket("**/socket*", socket => {
      live = socket;
      socket.onMessage(raw => {
        const event = JSON.parse(raw);
        sent.push(event);
        if (event.t !== "thread.load") return;
        if (event.page?.before) requests.push(event);
        else if (event.id === "other") push({ t: "thread.messages", threadId: "other", messages: [{ id: "other-message", role: "user", ts: 1, parts: [{ id: "other-part", kind: "text", text: "Background history", complete: true }] }], page: { revision: 1 } });
        else push({ t: "thread.messages", threadId: "chat", messages: messages(paging ? 160 : 0, paging ? 80 : 240), ...(paging ? { page: { next: "older-1", revision: 1 } } : {}) });
      });
      socket.send(JSON.stringify({ t: "hello", epoch: "history-fixture", sequence: 0, snapshot: { ...(paging ? { historyPaging: true } : {}), home: "/workspace", projects: [{ id: "project", name: "Project", path: "/workspace", isGit: true }], threads: [{ id: "chat", projectId: "project", title: "History paging", provider: "claude", status: "idle", running: false }], providers: [], permissions: [], shells: shell ? [{ id: "chat:old-call", threadId: "chat", command: "echo old", status: "running" }] : [] } }));
    });
    await page.route("**/api/**", route => route.fulfill({ json: [] }));
    const path = `/history-fixture-${++sequence}.html`;
    const html = await server.transformIndexHtml(path, `<!doctype html><html data-theme="neutral" data-scheme="dark"><body style="margin:0;background:#1e1e1e"><div id="fixture" style="position:absolute;inset:20px;display:flex;container:conversation / inline-size"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Conversation } from '/web/src/components/Conversation.tsx';
      import { connect } from '/web/src/lib/socket.ts';
      import { selectThread, useApp } from '/web/src/lib/store.ts';
      import '/web/src/styles/tokens.css';
      import '/web/src/styles/base.css';
      import '/web/src/styles/conversation.css';
      import '/web/src/styles/markdown.css';
      import '/web/src/styles/questions.css';
      import '/web/src/styles/diff.css';
      useApp.setState({ activeThreadId: 'chat', activeProjectId: 'project', textStreaming: false });
      window.historyState = () => useApp.getState();
      window.searchMessage = id => useApp.setState({ searchMessageId: id });
      window.searchShell = id => useApp.setState({ searchMessageId: null, searchShellId: id });
      window.selectThread = selectThread;
      connect();
      createRoot(document.querySelector('#fixture')).render(React.createElement(Conversation));
    </script></body></html>`);
    await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    await page.waitForFunction(() => window.historyState?.().loaded.chat);
    await page.locator('[data-message-id="m239"]').waitFor();
    const respond = (request, values, next) => push({ t: "thread.messages", threadId: "chat", requestId: request.requestId, messages: values, page: { before: request.page.before, revision: 1, ...(next ? { next } : {}) } });
    return { page, requests, respond, push, sent };
  }

  for (const width of [1280, 380]) await t.test(`prepending measured rows preserves reading position at ${width}px`, async t => {
    const { page, requests, respond, push } = await fixture(t, width);
    const canvas = page.locator(".canvas");
    await canvas.hover();
    await page.mouse.wheel(0, -100_000);
    await canvas.evaluate(element => { element.scrollTop = 0; });
    await page.locator('[data-message-id="m160"]').waitFor();
    await page.screenshot({ path: `/tmp/citropy-history-${width}.png` });
    const position = id => page.locator(`[data-message-id="${id}"]`).evaluate(element => element.getBoundingClientRect().top - document.querySelector(".canvas").getBoundingClientRect().top);
    const before = await position("m160");
    await page.getByRole("button", { name: "Load older messages", exact: true }).click();
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(await page.getByRole("button", { name: "Loading older messages…", exact: true }).isDisabled(), true);
    respond(requests[0], messages(120, 40), "older-2");
    await page.waitForFunction(() => window.historyState().order.chat.length === 120);
    await page.waitForTimeout(100);
    const after = await position("m160");
    assert.ok(Math.abs(after - before) < 2, `Expected first row at ${before}px, received ${after}px`);
    push({ t: "message.add", threadId: "chat", message: messages(240, 1)[0] });
    push({ t: "part.append", threadId: "chat", messageId: "m239", partId: "p239", text: " A new streamed update.".repeat(20) });
    await page.waitForFunction(() => window.historyState().order.chat.length === 121);
    await page.waitForTimeout(100);
    assert.ok(Math.abs(await position("m160") - before) < 2);
    await canvas.hover();
    await page.mouse.wheel(0, -100_000);
    await canvas.evaluate(element => { element.scrollTop = 0; });
    await page.locator('[data-message-id="m120"]').waitFor();
    const second = await position("m120");
    await page.getByRole("button", { name: "Load older messages", exact: true }).click();
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    respond(requests[1], messages(0, 120));
    await page.waitForFunction(() => window.historyState().order.chat.length === 241);
    await page.waitForTimeout(100);
    assert.ok(Math.abs(await position("m120") - second) < 2);
    assert.equal(await page.locator(".conversation-history").count(), 0);
    assert.ok(await page.locator(".timeline-row").count() < 30);
  });

  await t.test("a message search loads older pages until the target is available", async t => {
    const { page, requests, respond } = await fixture(t);
    await page.evaluate(() => window.searchMessage("m12"));
    await page.waitForFunction(() => document.querySelector('.conversation-history').getAttribute('aria-busy') === 'true');
    assert.equal(requests.length, 1);
    respond(requests[0], messages(80, 80), "older-2");
    await page.waitForFunction(() => window.historyState().order.chat.length === 160);
    await page.waitForTimeout(50);
    assert.equal(requests.length, 2);
    respond(requests[1], messages(0, 80));
    await page.waitForFunction(() => window.historyState().searchMessageId === null);
    await page.locator('[data-message-id="m12"]').waitFor();
    assert.ok(await page.locator('[data-message-id="m12"]').evaluate(element => {
      const canvas = document.querySelector('.canvas').getBoundingClientRect();
      const row = element.getBoundingClientRect();
      return row.bottom > canvas.top && row.top < canvas.bottom;
    }));
    assert.equal(requests.length, 2);
  });

  await t.test("user scrolling during a pending request keeps the current reading position", async t => {
    const { page, requests, respond } = await fixture(t);
    const canvas = page.locator(".canvas");
    await canvas.hover();
    await page.mouse.wheel(0, -100_000);
    await canvas.evaluate(element => { element.scrollTop = 0; });
    await page.getByRole("button", { name: "Load older messages", exact: true }).click();
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    await canvas.hover();
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(100);
    const anchor = await canvas.evaluate(element => {
      const top = element.getBoundingClientRect().top;
      const row = [...element.querySelectorAll('.timeline-row')].find(row => row.getBoundingClientRect().bottom > top);
      return { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - top };
    });
    assert.notEqual(anchor.id, "m160");
    respond(requests[0], messages(120, 40), "older-2");
    await page.waitForFunction(() => window.historyState().order.chat.length === 120);
    await page.waitForTimeout(100);
    const offset = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(element => element.getBoundingClientRect().top - document.querySelector('.canvas').getBoundingClientRect().top);
    assert.ok(Math.abs(offset - anchor.offset) < 2);
  });

  await t.test("shell navigation waits for older pages and focuses the command", async t => {
    const { page, requests, respond } = await fixture(t, 1280, true);
    await page.evaluate(() => window.searchShell("chat:old-call"));
    await page.waitForFunction(() => document.querySelector('.conversation-history').getAttribute('aria-busy') === 'true');
    assert.equal(await page.evaluate(() => window.historyState().toasts.length), 0);
    const older = messages(80, 80);
    older[5] = { id: "m85", role: "assistant", ts: 85, parts: [{ id: "old-tool", kind: "tool", callId: "old-call", name: "Bash", shape: "command", headline: "echo old", input: { command: "echo old" }, status: "ok", output: "old" }, { id: "p85", kind: "text", text: "Command finished", complete: true }] };
    respond(requests[0], older, "older-2");
    await page.waitForFunction(() => window.historyState().searchShellId === null);
    await page.locator("#tool-old-tool .tool-head").waitFor();
    assert.equal(await page.locator("#tool-old-tool .tool-head").evaluate(element => document.activeElement === element), true);
    assert.equal(await page.evaluate(() => window.historyState().toasts.length), 0);
    assert.equal(requests.length, 1);
  });

  await t.test("missing shell navigation reports absence only after the final page", async t => {
    const { page, requests, respond } = await fixture(t, 1280, true);
    await page.evaluate(() => window.searchShell("chat:old-call"));
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.historyState().searchShellId), "chat:old-call");
    respond(requests[0], messages(0, 160));
    await page.waitForFunction(() => window.historyState().searchShellId === null);
    assert.equal(await page.evaluate(() => window.historyState().toasts.filter(toast => toast.id === "shell-chat:old-call").length), 1);
    assert.equal(requests.length, 1);
  });

  await t.test("failed search paging stops retries and allows an explicit retry", async t => {
    const { page, requests, respond, push } = await fixture(t);
    await page.evaluate(() => window.searchMessage("m12"));
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    push({ t: "request.error", requestId: requests[0].requestId, error: "Paging failed" });
    await page.waitForFunction(() => window.historyState().toasts.some(toast => toast.text === "Paging failed"));
    await page.waitForTimeout(100);
    assert.equal(requests.length, 1);
    assert.equal(await page.evaluate(() => window.historyState().searchMessageId), "m12");
    await page.locator(".canvas").hover();
    await page.mouse.wheel(0, -100_000);
    await page.locator(".canvas").evaluate(element => { element.scrollTop = 0; });
    await page.getByRole("button", { name: "Load older messages", exact: true }).click();
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    respond(requests[1], messages(0, 160));
    await page.waitForFunction(() => window.historyState().searchMessageId === null);
    assert.equal(requests.length, 2);
  });

  await t.test("a server without paging capability still loads the complete history", async t => {
    const { page, requests, sent } = await fixture(t, 1280, false, false);
    assert.equal(await page.evaluate(() => window.historyState().order.chat.length), 240);
    assert.equal(sent.find(event => event.t === "thread.load").page, undefined);
    assert.equal(sent.some(event => event.t === "thread.subscribe"), false);
    assert.equal(await page.locator(".conversation-history").count(), 0);
    await page.evaluate(() => window.searchMessage("m12"));
    await page.waitForFunction(() => window.historyState().searchMessageId === null);
    await page.locator('[data-message-id="m12"]').waitFor();
    assert.equal(requests.length, 0);
  });

  await t.test("a cursor reset replaces obsolete pages before search continues", async t => {
    const { page, requests, push } = await fixture(t);
    await page.evaluate(() => window.searchMessage("m12"));
    await page.getByRole("button", { name: "Loading older messages…", exact: true }).waitFor();
    push({ t: "thread.messages", threadId: "chat", requestId: requests[0].requestId, messages: messages(200, 80), page: { next: "reset-older", revision: 2 } });
    await page.waitForFunction(() => window.historyState().historyPages.chat.revision === 2);
    await waitUntil(() => requests.length === 2);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].page, { before: "reset-older", revision: 2 });
    assert.equal(await page.evaluate(() => window.historyState().messages.m160), undefined);
    push({ t: "thread.messages", threadId: "chat", requestId: requests[1].requestId, messages: messages(0, 200), page: { before: "reset-older", revision: 2 } });
    await page.waitForFunction(() => window.historyState().searchMessageId === null);
    await page.locator('[data-message-id="m12"]').waitFor();
    assert.equal(await page.evaluate(() => window.historyState().order.chat.length), 280);
  });

  await t.test("loaded background histories update the live subscription set", async t => {
    const { page, sent, push } = await fixture(t);
    assert.deepEqual(sent.find(event => event.t === "thread.subscribe").ids, ["chat"]);
    push({ t: "thread.upsert", thread: { id: "other", projectId: "project", title: "Background", provider: "claude", status: "idle", running: false } });
    await page.waitForFunction(() => window.historyState().threads.other);
    await page.evaluate(() => window.selectThread("other"));
    await page.waitForFunction(() => window.historyState().loaded.other);
    assert.deepEqual(sent.filter(event => event.t === "thread.subscribe").at(-1).ids, ["chat", "other"]);
    push({ t: "thread.remove", id: "other" });
    await page.waitForFunction(() => !window.historyState().loaded.other);
    assert.deepEqual(sent.filter(event => event.t === "thread.subscribe").at(-1).ids, ["chat"]);
  });
});
