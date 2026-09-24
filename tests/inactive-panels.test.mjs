import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("inactive panels defer work while retaining drafts, disclosures, and terminal state", { timeout: 60000 }, async t => {
  const cacheDir = await mkdtemp(join(tmpdir(), "citropy-inactive-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), cacheDir, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); await rm(cacheDir, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.routeWebSocket("**/socket", socket => {
    socket.onMessage(raw => {
      const event = JSON.parse(raw);
      requests.push(event);
      if (event.t === "git.diff") socket.send(JSON.stringify({ t: "git.diff", requestId: event.requestId, patch: { path: "sample.ts", added: 1, removed: 0, hunks: [{ header: "@@ -0,0 +1 @@", oldStart: 0, newStart: 1, lines: [{ kind: "add", text: "preserved diff", newLine: 1 }] }] } }));
      if (event.t === "github.request") socket.send(JSON.stringify({ t: "github.result", requestId: event.requestId, result: event.request.operation === "runs" ? { items: [{ id: 1, display_title: "Running workflow", status: "in_progress", head_branch: "main", event: "push", created_at: new Date().toISOString() }], total: 1 } : [] }));
      if (event.t === "term.open") socket.send(JSON.stringify({ t: "term.data", termId: "terminal", data: "Terminal preserved\r\n" }));
    });
  });
  const html = await server.transformIndexHtml("/inactive.html", `<!doctype html><html data-theme="dark"><body><div id="fixture"></div><script type="module">
    import React, { Profiler, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { Changes } from '/web/src/components/Changes.tsx';
    import { SubagentsPane } from '/web/src/components/SubagentsPane.tsx';
    import { TerminalPane } from '/web/src/components/TerminalPane.tsx';
    import { GitHubActions } from '/web/src/components/github/GitHubActions.tsx';
    import { useApp } from '/web/src/lib/store.ts';
    import { connect } from '/web/src/lib/socket.ts';
    ${["tokens", "base", "app", "features", "inspector", "git", "markdown", "overlays"].map(name => `import '/web/src/styles/${name}.css';`).join("\n")}
    const h = React.createElement;
    window.app = useApp;
    window.subagentRenders = 0;
    const child = { id: 'child', title: 'Child task', parentThreadId: 'parent', parentMessageId: 'message', provider: 'claude', createdAt: 1, running: false, status: 'done' };
    useApp.setState({ connected: true, activeProjectId: 'workspace', activeThreadId: 'parent', threads: { parent: { id: 'parent', projectId: 'workspace' }, child }, git: { workspace: { branch: 'main', files: [{ path: 'sample.ts', index: ' ', work: 'M', added: 1, removed: 0, staged: false }] } } });
    const terminal = { id: 'terminal', projectId: 'workspace', kind: 'terminal', title: 'Terminal' };
    function Fixture() {
      const [active, setActive] = useState(false);
      const [mode, setMode] = useState('changes');
      window.activate = setActive;
      window.mode = setMode;
      return h('div', { style: { height: 700, width: 800 } },
        mode === 'changes' && h('div', { hidden: !active, style: { height: 600 } }, h(Changes, { active })),
        mode === 'agents' && h(Profiler, { id: 'agents', onRender: () => window.subagentRenders++ }, h(SubagentsPane)),
        mode === 'github' && h(GitHubActions, { repository: { full_name: 'example/repo', permissions: {} } }),
        mode === 'terminal' && h('div', { hidden: !active, style: { height: 600 } }, h(TerminalPane, { panel: terminal, active })));
    }
    connect();
    createRoot(document.getElementById('fixture')).render(h(Fixture));
  </script></body></html>`);
  await page.route("**/inactive.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(`${server.resolvedUrls.local[0]}inactive.html`);
  await page.waitForFunction(() => Boolean(window.activate));
  const count = type => requests.filter(event => event.t === type).length;
  assert.equal(count("git.refresh"), 0);
  await page.evaluate(() => window.activate(true));
  await page.getByRole("button", { name: /sample.ts/ }).click();
  await page.getByText("preserved diff", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Commit title" }).fill("Keep my draft");
  await page.evaluate(() => window.activate(false));
  const beforeDiffs = count("git.diff");
  for (let added = 2; added <= 5; added++) {
    await page.evaluate(added => window.app.setState(state => ({ git: { workspace: { ...state.git.workspace, files: [{ ...state.git.workspace.files[0], added }] } } })), added);
    await page.waitForTimeout(30);
  }
  assert.equal(count("git.diff"), beforeDiffs);
  await page.evaluate(() => window.activate(true));
  await page.getByText("preserved diff", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Commit title" }).inputValue(), "Keep my draft");
  assert.equal(await page.getByRole("button", { name: /sample.ts/ }).getAttribute("aria-expanded"), "true");
  await page.waitForTimeout(50);
  assert.equal(count("git.diff"), beforeDiffs + 1);

  await page.evaluate(() => window.mode('agents'));
  await page.getByText('Child task', { exact: true }).waitFor();
  await page.waitForTimeout(250);
  const beforeRenders = await page.evaluate(() => window.subagentRenders);
  for (let i = 0; i < 20; i++) {
    await page.evaluate(i => window.app.setState(state => ({ threads: { ...state.threads, unrelated: { id: 'unrelated', title: String(i) } } })), i);
  }
  assert.equal(await page.evaluate(() => window.subagentRenders), beforeRenders);
  await page.evaluate(() => window.app.setState(state => ({ threads: { ...state.threads, child: { ...state.threads.child, title: 'Updated child' } } })));
  await page.getByText('Updated child', { exact: true }).waitFor();

  await page.clock.install();
  await page.evaluate(() => window.mode('github'));
  await page.getByText('Running workflow', { exact: true }).waitFor();
  const runs = () => requests.filter(event => event.t === 'github.request' && event.request.operation === 'runs').length;
  const beforePolls = runs();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(60000);
  assert.equal(runs(), beforePolls);
  assert.equal(await page.getByText('Running workflow', { exact: true }).count(), 1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(100);
  assert.equal(runs(), beforePolls + 1);
  await page.waitForTimeout(100);
  await page.clock.runFor(20100);
  await page.waitForTimeout(100);
  assert.equal(runs(), beforePolls + 2);
  await page.clock.resume();

  await page.evaluate(() => { window.mode('terminal'); window.activate(true); });
  await page.locator('.xterm-screen').waitFor();
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.savedTerminal = document.querySelector('.xterm'); window.activate(false); });
  await page.waitForTimeout(50);
  const beforeResize = count('term.resize');
  await page.evaluate(() => window.app.setState({ uiScale: 150, theme: 'light' }));
  await page.waitForTimeout(100);
  assert.equal(count('term.resize'), beforeResize);
  await page.evaluate(() => window.activate(true));
  await page.locator('.xterm-screen').waitFor();
  assert.equal(await page.evaluate(() => window.savedTerminal === document.querySelector('.xterm')), true);
  assert.equal(count('term.open'), 2);
  assert.deepEqual(errors, []);
  t.diagnostic('Hidden diff updates: 0 requests for 4 changes; unrelated chats: 0 Subagents renders for 20 updates; hidden workflows: 0 polls over 60 seconds.');
});
