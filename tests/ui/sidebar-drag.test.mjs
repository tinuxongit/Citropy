import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const DRAG_STEPS = 10;

test("sidebar drags keep the dragged row visible and reorder chats and projects", { timeout: 90_000 }, async t => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-sidebar-drag-tests`, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await browser.close(); await server.close(); assert.deepEqual(errors, []); });
  const path = "/sidebar-drag-fixture.html";
  const html = await server.transformIndexHtml(path, `<!doctype html><html data-theme="neutral" data-scheme="dark"><body><div id="fixture" style="height:100vh;display:flex"></div><script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { Sidebar } from '/web/src/components/Sidebar.tsx';
    import { useApp } from '/web/src/lib/store.ts';
    import { connectEnvironment, pickEnvironmentSlice } from '/web/src/lib/socket.ts';
    import '/web/src/styles/tokens.css';
    import '/web/src/styles/base.css';
    import '/web/src/styles/sidebar.css';
    import '/web/src/styles/workbench.css';
    import '/web/src/styles/overlays.css';
    import '/web/src/styles/virtual-list.css';
    const fake = { readyState: 1, send() {}, close() {} };
    connectEnvironment('local', location.origin, { socket: fake, events: [] }, pickEnvironmentSlice(useApp.getState()));
    let app;
    window.setup = (perProject) => {
      if (app) flushSync(() => app.unmount());
      localStorage.clear();
      const projects = ['a', 'b', 'c'].map((id, index) => ({ id, name: 'Project ' + id.toUpperCase(), path: '/' + id, isGit: false, lastOpened: index }));
      const threads = Object.fromEntries(projects.flatMap(project => Array.from({ length: perProject }, (_, index) => {
        const id = project.id + index;
        return [id, { id, projectId: project.id, title: 'Chat ' + id, provider: 'codex', model: 'model', permissionMode: 'manual', status: 'idle', running: false, createdAt: index + 1, updatedAt: 100 - index, position: index, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0 } }];
      })));
      useApp.setState({ ...useApp.getInitialState(), threads, threadOrder: Object.keys(threads), activeProjectId: 'a', activeThreadId: null, connected: true, projects, providers: [{ id: 'codex', label: 'Codex', enabled: true, available: true, models: [] }], sidebarGroups: {}, uiScale: 100, loaded: {} });
      app = createRoot(document.querySelector('#fixture'));
      flushSync(() => app.render(React.createElement(Sidebar, { onConversation() {} })));
    };
  </script></body></html>`);
  await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.setup);

  const press = async (name, distance) => {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    const x = box.x + 60;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= DRAG_STEPS; step++) await page.mouse.move(x, y + distance * step / DRAG_STEPS);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return { x, y: y + distance };
  };
  const hit = ({ x, y }) => page.evaluate(([x, y]) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest(".thread-entry")?.dataset.threadId ?? element?.closest(".thread-category")?.dataset.category;
  }, [x, y]);
  const titles = (selector) => page.locator(selector).evaluateAll(rows => rows.map(row => row.getAttribute("aria-label")));

  await t.test("a dragged chat stays visible while it moves", async () => {
    await page.evaluate(() => window.setup(4));
    const pointer = await press("Chat a0", 70);
    assert.equal(await hit(pointer), "a0");
    await page.mouse.up();
    assert.deepEqual((await titles('[data-category="project:a"] .thread-row')).slice(0, 3), ["Chat a1", "Chat a2", "Chat a0"]);
  });

  await t.test("a dragged project closes while it moves and reopens where it lands", async () => {
    await page.evaluate(() => window.setup(4));
    const pointer = await press("Collapse Project A", 200);
    assert.equal(await hit(pointer), "project:a");
    assert.equal(await page.locator('[data-category="project:a"] .thread-row').count(), 0);
    await page.mouse.up();
    await page.getByRole("button", { name: "Chat a0", exact: true }).waitFor();
    assert.deepEqual(await titles(".global-project-toggle"), ["Collapse Project B", "Collapse Project A", "Collapse Project C"]);
  });

  await t.test("project drags keep working in long virtualized lists", async () => {
    await page.evaluate(() => window.setup(70));
    assert.equal(await page.locator(".thread-list").getAttribute("data-virtualized"), "true");
    const pointer = await press("Collapse Project A", 60);
    assert.equal(await hit(pointer), "project:a");
    assert.equal(await page.locator('[data-category="project:a"] .thread-row').count(), 0);
    await page.mouse.up();
    await page.getByRole("button", { name: "Chat a0", exact: true }).waitFor();
  });
});
