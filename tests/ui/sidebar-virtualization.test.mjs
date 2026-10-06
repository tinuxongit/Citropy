import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("sidebar bounds rows and loads history only when a conversation opens", { timeout: 60_000 }, async t => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-sidebar-virtualization-tests`, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await browser.close(); await server.close(); assert.deepEqual(errors, []); });
  const path = "/sidebar-virtualization-fixture.html";
  const html = await server.transformIndexHtml(path, `<!doctype html><html data-theme="neutral" data-scheme="dark"><body><div id="fixture" style="height:100vh;display:flex"></div><script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { Sidebar } from '/web/src/components/Sidebar.tsx';
    import { useApp } from '/web/src/lib/store.ts';
    import { applyEvents } from '/web/src/lib/server-events.ts';
    import { connectEnvironment, pickEnvironmentSlice } from '/web/src/lib/socket.ts';
    import '/web/src/styles/tokens.css';
    import '/web/src/styles/base.css';
    import '/web/src/styles/sidebar.css';
    import '/web/src/styles/workbench.css';
    import '/web/src/styles/overlays.css';
    import '/web/src/styles/virtual-list.css';
    window.sent = [];
    const fake = { readyState: 1, send(raw) { window.sent.push(JSON.parse(raw)); }, close() {} };
    connectEnvironment('local', location.origin, { socket: fake, events: [] }, pickEnvironmentSlice(useApp.getState()));
    let app;
    window.setup = (count, scenario = 'flat') => {
      if (app) flushSync(() => app.unmount());
      const threads = Object.fromEntries(Array.from({ length: count }, (_, index) => {
        const id = 't' + index;
        return [id, { id, projectId: 'project', title: 'Chat ' + index, provider: 'codex', model: 'model', permissionMode: 'manual', status: scenario === 'children' && index < 501 ? 'working' : 'idle', running: scenario === 'children' && index < 501, createdAt: index + 1, updatedAt: count - index, position: index, finished: scenario === 'closed', ...(scenario === 'children' && index > 0 && index < 501 ? { parentThreadId: 't0' } : {}), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0 } }];
      }));
      useApp.setState({ ...useApp.getInitialState(), threads, threadOrder: Object.keys(threads), activeProjectId: 'project', activeThreadId: null, connected: true, projects: [{ id: 'project', name: 'Project', path: '/fixture', isGit: false, lastOpened: 1 }], providers: [{ id: 'codex', label: 'Codex', enabled: true, available: true, models: [] }], sidebarGroups: {}, uiScale: 100, loaded: {} });
      window.sent.length = 0;
      app = createRoot(document.querySelector('#fixture'));
      flushSync(() => app.render(React.createElement(Sidebar, { onConversation() {} })));
    };
    window.updateThread = (id, patch) => flushSync(() => useApp.setState(state => applyEvents(state, [{ t: 'thread.upsert', thread: { ...state.threads[id], ...patch } }])));
    window.sidebarStore = useApp;
  </script></body></html>`);
  await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.setup);

  await t.test("hover previews avoid history requests and opening still loads", async () => {
    await page.evaluate(() => window.setup(500));
    const first = page.getByRole("button", { name: "Chat 0", exact: true });
    await first.waitFor();
    assert.ok(await page.locator(".thread-row").count() < 50);
    await page.evaluate(() => {
      for (const row of [...document.querySelectorAll('.thread-row')].slice(0, 10)) {
        row.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
        row.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
      }
    });
    await first.hover();
    await page.getByRole("tooltip").waitFor();
    assert.deepEqual(await page.evaluate(() => window.sent.filter(event => event.t === 'thread.load')), []);
    await first.click();
    assert.deepEqual(await page.evaluate(() => window.sent.filter(event => event.t === 'thread.load').map(event => event.id)), ["t0"]);
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = 3000; });
    await page.waitForFunction(() => document.querySelector('.rail-list').scrollTop >= 3000);
    const position = await page.locator(".rail-list").evaluate(element => element.scrollTop);
    await page.evaluate(() => window.updateThread('t0', { title: 'Updated chat', usage: { input: 0, output: 100, costUsd: 0, turns: 1 } }));
    await page.getByRole("button", { name: "Updated chat", exact: true }).waitFor({ state: "attached" });
    assert.ok(Math.abs(await page.locator(".rail-list").evaluate(element => element.scrollTop) - position) < 2);
    assert.ok(await page.locator(".thread-row").count() < 50);
  });

  await t.test("collapsed finished chats stay hidden and expanding stays bounded", async () => {
    await page.evaluate(() => window.setup(5000, 'closed'));
    assert.equal(await page.locator(".thread-row").count(), 0);
    await page.evaluate(() => window.updateThread('t4999', { title: 'Updated finished chat' }));
    assert.equal(await page.locator(".thread-row").count(), 0);
    await page.getByRole("button", { name: "Expand Finished", exact: true }).click();
    await page.getByRole("button", { name: "Chat 0", exact: true }).waitFor();
    assert.ok(await page.locator(".thread-row").count() < 50);
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.getByRole("button", { name: "Updated finished chat", exact: true }).waitFor();
    assert.ok(await page.locator(".thread-row").count() < 50);
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = 0; });
    await page.getByRole("button", { name: "Collapse Finished", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.thread-row').length === 0);
  });

  await t.test("large subagent lists retain selection and focus while scrolling", async () => {
    await page.evaluate(() => window.setup(560, 'children'));
    await page.getByRole("button", { name: "Chat 1", exact: true }).waitFor();
    assert.ok(await page.locator(".thread-child").count() < 50);
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = 17_000; });
    const last = page.getByRole("button", { name: "Chat 500", exact: true });
    await last.waitFor();
    await last.focus();
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.getByRole("button", { name: "Chat 559", exact: true }).waitFor();
    assert.ok(await last.evaluate(element => element === document.activeElement));
    await last.click();
    assert.equal(await page.evaluate(() => window.sidebarStore.getState().activeThreadId), "t500");
    assert.ok((await page.evaluate(() => window.sent)).some(event => event.t === 'thread.load' && event.id === 't500'));
    assert.ok(await last.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const viewport = document.querySelector('.rail-list').getBoundingClientRect();
      return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
    }));
    await last.focus();
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.getByRole("button", { name: "Chat 559", exact: true }).waitFor();
    assert.ok(await last.evaluate(element => element === document.activeElement));
    assert.ok(await page.locator('.thread-entry[data-thread-id="t0"]').count() === 1);
    assert.ok(await page.locator(".thread-child").count() < 50);
    await page.getByRole("textbox", { name: "Find a conversation", exact: true }).focus();
    await page.locator(".rail-list").evaluate(element => { element.scrollTop = 0; });
    await page.waitForFunction(() => document.querySelector('.thread-child[data-active="true"]'));
    assert.ok(await page.locator(".selection-highlight").evaluate(element => {
      if (element.hidden) return true;
      const bounds = element.getBoundingClientRect();
      const viewport = document.querySelector('.rail-list').getBoundingClientRect();
      return bounds.bottom <= viewport.top || bounds.top >= viewport.bottom;
    }));
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 860 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await page.locator(".thread-child").count() < 50);
      await page.screenshot({ path: `/tmp/citropy-sidebar-optimized-${width}.png` });
    }
  });
});
