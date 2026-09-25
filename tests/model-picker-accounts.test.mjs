import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

test("model picker selects provider accounts and transfers to them", { timeout: 60000 }, async t => {
  const source = `import React from "react";
import { createRoot } from "react-dom/client";
import { ModelPicker } from "/web/src/components/ModelPicker.tsx";
import { useApp } from "/web/src/lib/store.ts";
import { connect } from "/web/src/lib/socket.ts";
import "/web/src/styles/tokens.css";
import "/web/src/styles/base.css";
import "/web/src/styles/app.css";
import "/web/src/styles/overlays.css";
useApp.setState({ connected: true, providers: [
  { id: "claude", label: "Claude", available: true, enabled: true, models: [{ id: "claude-default", label: "Claude model" }] },
  { id: "pi", label: "Pi", available: false, enabled: true, models: [], instances: [{ id: "pvi-personal", name: "Personal", available: true, models: [{ id: "test/account", label: "Account model" }] }] },
] });
connect();
createRoot(document.getElementById("root")).render(<>
  <ModelPicker label="Model" value={{ provider: "claude", model: "claude-default" }} onChange={value => window.selection = value} onTransfer={value => window.transfer = value} />
  <ModelPicker label="Default model" defaultOnly value={{ provider: "claude", model: "claude-default" }} onChange={value => window.defaultSelection = value} />
</>);`;
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), plugins: [react(), { name: "model-picker-accounts-fixture", resolveId(id) { if (id === "/__model_picker_fixture.tsx") return id; }, load(id) { if (id === "/__model_picker_fixture.tsx") return source; } }], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const html = '<!doctype html><html data-theme="dark"><body><div id="root"></div><script type="module" src="/__model_picker_fixture.tsx"></script></body></html>';
  await page.route("**/model-picker-fixture", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/model-picker-fixture", html) }));
  await page.goto(new URL("model-picker-fixture", server.resolvedUrls.local[0]).href);
  await page.getByRole("button", { name: "Model: Claude model", exact: true }).click();
  await page.getByRole("button", { name: "Pi", exact: true }).click();
  await page.getByRole("menuitem", { name: /Account model/ }).click();
  assert.deepEqual(await page.evaluate(() => window.selection), { provider: "pi", providerInstanceId: "pvi-personal", model: "test/account" });
  await page.getByRole("button", { name: "Model: Claude model", exact: true }).click();
  await page.getByRole("button", { name: "Transfer to another agent" }).click();
  await page.getByRole("button", { name: "Pi", exact: true }).click();
  await page.getByRole("menuitem", { name: /Account model/ }).click();
  assert.deepEqual(await page.evaluate(() => window.transfer), { provider: "pi", providerInstanceId: "pvi-personal", model: "test/account" });
  await page.getByRole("button", { name: "Default model: Claude model" }).click();
  assert.equal(await page.getByRole("button", { name: "Pi", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});
