import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

test("writing model settings select a named provider account", { timeout: 60000 }, async t => {
  const source = `import React from "react";
import { createRoot } from "react-dom/client";
import { AssistanceSettings } from "/web/src/components/AssistanceSettings.tsx";
import { useApp } from "/web/src/lib/store.ts";
import "/web/src/styles/tokens.css";
import "/web/src/styles/base.css";
import "/web/src/styles/app.css";
import "/web/src/styles/settings.css";
import "/web/src/styles/overlays.css";
useApp.setState({ connected: true, assistance: { automaticTitles: true, titleModel: null, commitModel: null, reviewModel: null }, providers: [{ id: "pi", label: "Pi", available: false, enabled: true, models: [], supportsPermissionPrompt: true, instances: [{ id: "pvi-personal", name: "Personal", available: true, models: [{ id: "test/account", label: "Account model" }] }] }] });
createRoot(document.getElementById("root")).render(<AssistanceSettings />);`;
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), plugins: [react(), { name: "assistance-account-fixture", resolveId(id) { if (id === "/__assistance_fixture.tsx") return id; }, load(id) { if (id === "/__assistance_fixture.tsx") return source; } }], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, reducedMotion: "reduce" });
  const errors = [];
  const requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/providers/assistance", async route => {
    const patch = JSON.parse(route.request().postData());
    requests.push(patch);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ automaticTitles: true, titleModel: null, commitModel: null, reviewModel: null, ...patch }) });
  });
  const html = '<!doctype html><html data-theme="dark"><body><div id="root"></div><script type="module" src="/__assistance_fixture.tsx"></script></body></html>';
  await page.route("**/assistance-fixture", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/assistance-fixture", html) }));
  await page.goto(new URL("assistance-fixture", server.resolvedUrls.local[0]).href);
  await page.getByRole("combobox", { name: "Title model account" }).selectOption("pi:pvi-personal");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Title model account"]')?.value === "pi:pvi-personal");
  assert.deepEqual(requests[0].titleModel, { provider: "pi", providerInstanceId: "pvi-personal", model: "test/account" });
  for (const width of [1100, 420]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/citropy-assistance-account-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
});
