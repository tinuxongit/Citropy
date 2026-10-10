import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("composer resource usage", { timeout: 120_000 }, async (t) => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-composer-resource-tests`, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  let sequence = 0;
  async function fixture(t, body) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/skills?*", route => route.fulfill({ json: [{ id: "skill", name: "review", provider: "codex", enabled: true, scope: "project", description: "Review changes" }] }));
    await page.route("**/api/threads/context?*", route => route.fulfill({ json: [] }));
    await page.route("**/api/tool-mentions", route => route.fulfill({ json: [{ name: "browser", title: "Browser", description: "Use Citropy's shared browser", section: "Citropy" }, { name: "review", title: "Review", description: "Shadowed by the skill", section: "Citropy" }, { name: "gmail", title: "Gmail", description: "google.com", section: "Connections", url: "https://www.google.com/" }] }));
    t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
    const path = `/composer-resource-fixture-${++sequence}.html`;
    const html = await server.transformIndexHtml(path, `<!doctype html><html data-theme="neutral" data-scheme="dark"><body style="margin:0;background:#1e1e1e"><div id="fixture" style="margin:40px 20px"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { useApp, applyEvents } from '/web/src/lib/store.ts';
      import '/web/src/styles/tokens.css';
      import '/web/src/styles/base.css';
      import '/web/src/styles/composer.css';
      ${body}
    </script></body></html>`);
    await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    return page;
  }

  await t.test("the message box grows to a limit, turns mentions into named chips, and keeps plain text", async t => {
    const page = await fixture(t, `
      import { ComposerInput } from '/web/src/components/ComposerInput.tsx';
      const thread = { id: 'chat', projectId: 'project', provider: 'codex' };
      useApp.setState({ connected: true });
      window.submits = 0;
      function Fixture() {
        const [value, setValue] = React.useState('');
        window.setValue = setValue;
        window.value = value;
        window.setScale = scale => { useApp.setState({ uiScale: scale }); document.documentElement.style.setProperty('--ui-scale', scale / 100); };
        return React.createElement(ComposerInput, { value, onChange: setValue, onSubmit: () => window.submits++, onFiles: () => {}, disabled: false, thread, commands: [] });
      }
      createRoot(document.querySelector('#fixture')).render(React.createElement(Fixture));
    `);
    const input = page.getByRole("textbox", { name: "Message" });
    const value = () => page.evaluate(() => window.value);
    await input.waitFor();
    for (const width of [1280, 390]) {
      for (const scale of [75, 100, 150]) {
        const heights = [];
        for (const text of ["", "A short message", "A wrapping message with several words. ".repeat(20), "@review\n".repeat(50)]) {
          await page.setViewportSize({ width, height: 860 });
          await page.evaluate(({ scale, text }) => { window.setScale(scale); window.setValue(text); }, { scale, text });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          heights.push(await input.evaluate(node => node.getBoundingClientRect().height));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        assert.ok(heights[0] === heights[1] && heights[1] < heights[2] && heights[2] <= heights[3], `${width}px at ${scale}%: ${heights.join(", ")}`);
        assert.ok(await input.evaluate(node => node.scrollHeight > node.clientHeight));
      }
    }
    await page.evaluate(() => window.setValue(""));
    await input.fill("Check @");
    const menu = page.getByRole("listbox", { name: "Files and skills" });
    await menu.getByRole("option", { name: /Browser/ }).waitFor();
    assert.deepEqual(await menu.locator(".composer-suggestion-section").allInnerTexts(), ["Skills", "Citropy", "Connections"]);
    assert.equal(await menu.getByRole("option").count(), 3);
    await input.fill("Check @browser and @gmail now");
    assert.deepEqual(await input.locator(".mention-chip").allInnerTexts(), ["Browser", "Gmail"]);
    assert.deepEqual(await input.locator(".mention-chip > :first-child").evaluateAll(nodes => nodes.map(node => node.className)), ["citropy-mark", "link-site-icon"]);
    assert.equal(await value(), "Check @browser and @gmail now");
    await input.fill("Ask @bro");
    await page.keyboard.press("Enter");
    assert.equal(await value(), "Ask @browser ");
    assert.deepEqual(await input.locator(".mention-chip").allInnerTexts(), ["Browser"]);
    assert.equal(await page.evaluate(() => window.submits), 0);
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    assert.equal(await value(), "Ask ");
    await page.keyboard.type("@gmail");
    assert.equal(await input.locator(".mention-chip").count(), 0);
    await page.keyboard.press("Escape");
    await page.keyboard.type(" today");
    assert.equal(await value(), "Ask @gmail today");
    assert.deepEqual(await input.locator(".mention-chip").allInnerTexts(), ["Gmail"]);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Thanks");
    assert.equal(await value(), "Ask @gmail today\nThanks");
    await page.screenshot({ path: "/tmp/citropy-connections/editor-typed.png", clip: { x: 0, y: 0, width: 700, height: 160 } });
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => window.submits), 1);
    await page.evaluate(() => window.setValue("Restored @review draft"));
    await input.getByText("Restored").waitFor();
    assert.deepEqual(await input.locator(".mention-chip").allInnerTexts(), ["review"]);
    await page.screenshot({ path: "/tmp/citropy-connections/editor-chips.png", clip: { x: 0, y: 0, width: 700, height: 160 } });
  });

  await t.test("latest plan lookup skips text streams and follows plan replacement and history changes", async t => {
    const page = await fixture(t, `
      import { PlanTab } from '/web/src/components/composer/PlanTab.tsx';
      const history = Array.from({ length: 5000 }, (_, index) => ({ id: 'm' + index, role: 'assistant', ts: index, parts: [{ id: 'p' + index, kind: 'text', text: 'Answer', complete: false }] }));
      useApp.setState({ activeThreadId: 'chat', threads: { chat: { id: 'chat' } }, connected: true });
      window.emit = event => useApp.setState(state => applyEvents(state, [event]));
      window.emit({ t: 'thread.messages', threadId: 'chat', messages: history });
      window.historyReads = 0;
      const get = Map.prototype.get;
      Map.prototype.get = function(key) { if (typeof key === 'string' && /^p[0-9]+$/.test(key)) window.historyReads++; return get.call(this, key); };
      window.stream = () => {
        for (let index = 0; index < 30; index++) {
          const state = useApp.getState();
          const parts = new Map(state.parts);
          parts.set('p4999', { ...get.call(parts, 'p4999'), text: 'Answer ' + index });
          useApp.setState({ parts });
        }
      };
      window.setThread = null;
      function Fixture() {
        const [threadId, setThreadId] = React.useState('chat');
        window.setThread = setThreadId;
        return React.createElement('div', { className: 'composer-shell', style: { position: 'relative', width: 500, height: 200 } },
          React.createElement('div', { className: 'composer-tabs' }, React.createElement(PlanTab, { threadId })));
      }
      createRoot(document.querySelector('#fixture')).render(React.createElement(Fixture));
    `);
    await page.waitForFunction(() => window.setThread !== null && window.historyReads >= 5000);
    await page.evaluate(() => { window.historyReads = 0; window.stream(); });
    assert.equal(await page.evaluate(() => window.historyReads), 0);
    const emit = event => page.evaluate(event => window.emit(event), event);
    const add = (id, items) => emit({ t: "part.add", threadId: "chat", messageId: "m0", part: { id, kind: "todo", items } });
    const patch = (partId, patch) => emit({ t: "part.patch", threadId: "chat", messageId: "m0", partId, patch });
    await add("plan", [{ text: "First task", status: "pending" }]);
    await page.getByRole("button", { name: "Plan, 0 of 1 done" }).click();
    await page.getByText("First task", { exact: true }).waitFor();
    await patch("plan", { items: [{ text: "First task", status: "completed" }, { text: "Next task", status: "pending" }] });
    await page.getByRole("button", { name: "Plan, 1 of 2 done" }).waitFor();
    await page.getByText("Next task", { exact: true }).waitFor();
    await add("new-plan", [{ text: "Replacement task", status: "pending" }]);
    await page.getByText("Replacement task", { exact: true }).waitFor();
    await patch("new-plan", { kind: "text", text: "Replaced" });
    await page.getByText("Next task", { exact: true }).waitFor();
    await page.evaluate(() => window.setThread("empty"));
    await page.getByRole("button", { name: /Plan,/ }).waitFor({ state: "detached" });
    await page.evaluate(() => window.setThread("chat"));
    await page.getByRole("button", { name: "Plan, 1 of 2 done" }).waitFor();
    await page.evaluate(async () => {
      const { useApp } = await import('/web/src/lib/store.ts');
      const parts = new Map(useApp.getState().parts);
      parts.set('p4999', { id: 'p4999', kind: 'todo', items: [{ text: 'Unversioned plan', status: 'pending' }] });
      useApp.setState({ parts, timelineVersions: {} });
    });
    await page.getByRole("button", { name: "Plan, 0 of 1 done" }).click();
    await page.getByText("Unversioned plan", { exact: true }).waitFor();
    await emit({ t: "thread.messages", threadId: "chat", messages: [] });
    await page.getByRole("button", { name: /Plan,/ }).waitFor({ state: "detached" });
  });

  await t.test("draft saves coalesce typing and flush on switch, send and page exit", async t => {
    const page = await fixture(t, `
      import { flushSync } from 'react-dom';
      import { useComposerDraft } from '/web/src/components/composer/use-composer-draft.ts';
      import { environmentStorage } from '/web/src/lib/environment.ts';
      const write = environmentStorage.setItem.bind(environmentStorage);
      write('citropy.draft.chat', JSON.stringify({ text: 'Local draft', attachments: [] }), 'local');
      write('citropy.draft.chat', JSON.stringify({ text: 'Remote draft', attachments: [] }), 'remote');
      window.draftWrites = [];
      environmentStorage.setItem = (...args) => { window.draftWrites.push(args); write(...args); };
      function Fixture({ scope }) {
        const draft = useComposerDraft('chat', scope);
        window.changeDraft = value => flushSync(() => draft.setValue(value));
        window.clearDraft = draft.clearDraft;
        return React.createElement('textarea', { 'aria-label': 'Draft', value: draft.value, onChange: event => draft.setValue(event.target.value) });
      }
      const root = createRoot(document.querySelector('#fixture'));
      window.mountDraft = scope => flushSync(() => root.render(React.createElement(Fixture, { key: scope, scope })));
      window.mountDraft('local');
    `);
    await page.getByRole('textbox', { name: 'Draft' }).waitFor();
    const immediate = await page.evaluate(() => {
      window.draftWrites = [];
      for (let index = 0; index < 20; index++) window.changeDraft('Typing ' + index);
      return window.draftWrites.length;
    });
    assert.equal(immediate, 0);
    await page.waitForFunction(() => window.draftWrites.length === 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('citropy.draft.chat')).text), 'Typing 19');
    await page.evaluate(() => { window.changeDraft('Before switch'); window.mountDraft('remote'); });
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Remote draft');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('citropy.draft.chat')).text), 'Before switch');
    await page.evaluate(() => { window.changeDraft('Sent message'); window.clearDraft(); window.mountDraft('local'); window.dispatchEvent(new Event('pagehide')); });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('citropy.environment.remote.citropy.draft.chat') || '{}').text || ''), '');
    await page.evaluate(() => window.mountDraft('remote'));
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), '');
    await page.evaluate(() => { window.changeDraft('Before exit'); window.dispatchEvent(new Event('pagehide')); });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('citropy.environment.remote.citropy.draft.chat')).text), 'Before exit');
    await page.evaluate(() => window.mountDraft('local'));
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Before switch');
  });

  await t.test("frame masks change only when shell or animated tab geometry changes", async t => {
    const page = await fixture(t, `
      import { ComposerFrame } from '/web/src/components/composer/ComposerFrame.tsx';
      window.maskWrites = 0;
      Object.defineProperty(CSSStyleDeclaration.prototype, 'maskImage', {
        configurable: true,
        get() { return this.getPropertyValue('mask-image'); },
        set(value) { window.maskWrites++; this.setProperty('mask-image', value); },
      });
      createRoot(document.querySelector('#fixture')).render(React.createElement('div', { className: 'composer-shell', style: { width: 300, height: 100 } },
        React.createElement(ComposerFrame),
        React.createElement('div', { className: 'composer-tabs', style: { position: 'absolute', top: -24, paddingLeft: 8 } },
          React.createElement('button', { className: 'composer-tab', style: { height: 24, width: 90, borderRadius: 8, transform: 'translateY(0px)' } }, 'Plan'))));
    `);
    await page.waitForFunction(() => document.querySelector('.composer-glass')?.style.maskImage);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.maskWrites), 2);
    const initial = await page.locator('.composer-glass').evaluate(node => node.style.maskImage);
    await page.locator('.composer-tab').evaluate(node => { node.style.opacity = '0.5'; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await page.evaluate(() => window.maskWrites), 2);
    await page.locator('.composer-tab').evaluate(node => { node.style.transform = 'translateY(12px)'; });
    await page.waitForFunction(initial => document.querySelector('.composer-glass').style.maskImage !== initial, initial);
    assert.equal(await page.evaluate(() => window.maskWrites), 4);
    const moved = await page.locator('.composer-glass').evaluate(node => node.style.maskImage);
    await page.locator('.composer-shell').evaluate(node => { node.style.height = '140px'; });
    await page.waitForFunction(moved => document.querySelector('.composer-glass').style.maskImage !== moved, moved);
    assert.equal(await page.evaluate(() => window.maskWrites), 6);
  });
});
