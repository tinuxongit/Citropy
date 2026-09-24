import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("menu surfaces retain focus while outside interaction and selection dismiss them", { timeout: 30000 }, async t => {
  const cacheDir = await mkdtemp(join(tmpdir(), "citropy-menu-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), cacheDir, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); await rm(cacheDir, { recursive: true, force: true }); });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const html = await server.transformIndexHtml('/menu.html', `<!doctype html><html data-theme="dark"><body><div id="fixture"></div><script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Menu } from '/web/src/components/Menu.tsx';
    import { ModelPicker } from '/web/src/components/ModelPicker.tsx';
    import { useApp } from '/web/src/lib/store.ts';
    import '/web/src/styles/tokens.css';
    import '/web/src/styles/base.css';
    import '/web/src/styles/overlays.css';
    const h = React.createElement;
    useApp.setState({ uiScale: 100, providers: [{ id: 'claude', label: 'Claude', available: true, enabled: true, models: [{ id: 'fast', label: 'Fast' }] }] });
    createRoot(document.getElementById('fixture')).render(h('div', null,
      h(Menu, { header: 'Actions', items: [{ id: 'disabled', label: 'Unavailable', disabled: true }, { id: 'select', label: 'Select', section: 'Choices', onSelect: () => window.chosen = true }], trigger: ({ id, toggle }) => h('button', { id, onClick: toggle }, 'Open menu') }),
      h(ModelPicker, { label: 'Model', value: { provider: 'claude', model: 'fast' }, onChange: () => {} }),
      h('button', { id: 'outside' }, 'Outside')));
  </script></body></html>`);
  await page.route('**/menu.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${server.resolvedUrls.local[0]}menu.html`);
  const menu = page.getByRole('menu');
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    for (const selector of ['.menu-header', '.menu-section']) {
      await menu.locator(selector).click();
      assert.equal(await menu.count(), 1);
      assert.equal(await menu.evaluate(node => node.contains(document.activeElement)), true);
    }
    await menu.click({ position: { x: 2, y: 2 } });
    assert.equal(await menu.count(), 1);
    await menu.getByRole('menuitem', { name: 'Select', exact: true }).click();
    await menu.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.chosen), true);
    await page.getByRole('button', { name: 'Model: Fast', exact: true }).click();
    await menu.getByRole('textbox', { name: 'Search models', exact: true }).fill('no matching models');
    await menu.locator('.menu-empty').click();
    assert.equal(await menu.count(), 1);
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Outside', exact: true }).click();
    await menu.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Outside', exact: true }).focus();
    await menu.waitFor({ state: 'detached' });
  }
});
