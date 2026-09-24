import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("a connection snapshot that finishes loading late does not erase a newer disconnect", { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-environment-snapshot-"));
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), plugins: [react()], logLevel: "error", cacheDir: join(directory, "cache"), server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });

  async function open(startingEnvironment, delayHello = false) {
    let releaseHello;
    let releaseHistory;
    const historyReady = Promise.withResolvers();
    const helloReady = Promise.withResolvers();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(startingEnvironment => {
      localStorage.setItem("citropy.project", "project");
      localStorage.setItem("citropy.thread", "task");
      const connection = { id: "ssh-test", name: "Build server", target: "dev@buildbox", port: 22, node: "node", status: startingEnvironment === "local" ? "disconnected" : "connected" };
      let activeId = startingEnvironment;
      const listeners = new Set();
      const state = () => ({ activeId, endpoint: activeId === "local" ? "" : "http://127.0.0.1:49121", connections: [{ ...connection }] });
      const emit = () => { for (const listener of listeners) listener(state()); };
      window.showConnectionProgress = () => { connection.status = "connecting"; connection.message = "Installing remote backend…"; emit(); };
      window.citropyDesktop = {
        environmentsState: async () => state(),
        sshHosts: async () => [],
        onEnvironmentsState: callback => { listeners.add(callback); return () => listeners.delete(callback); },
        connectEnvironment: async id => {
          activeId = id;
          connection.status = "connected";
          const snapshot = state();
          emit();
          await new Promise(resolve => { window.releaseSnapshot = resolve; });
          return snapshot;
        },
        disconnectEnvironment: async () => { connection.status = "disconnected"; emit(); },
        windowState: async () => ({ platform: "linux", maximized: false, fullscreen: false, development: true, version: "test", notifications: false, electron: "test" }),
        onWindowState: () => () => {},
        onNotification: () => () => {},
        onBrowserSelect: () => () => {},
        updateState: async () => ({ status: "idle", version: "test" }),
        onUpdateState: () => () => {},
      };
    }, startingEnvironment);
    await page.route("**/api/**", route => route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*" } }));
    await page.routeWebSocket("**/socket", socket => {
      socket.onMessage(raw => {
        const event = JSON.parse(raw);
        if (event.t !== "thread.load") return;
        const sendHistory = () => socket.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: [{ id: "ready", role: "assistant", ts: 1, parts: [{ id: "text", kind: "text", text: "Destination history", complete: true }] }] }));
        if (delayHello && socket.url().includes(":49121/")) { releaseHistory = sendHistory; historyReady.resolve(); }
        else sendHistory();
      });
      const sendHello = () => socket.send(JSON.stringify({ t: "hello", snapshot: {
        projects: [{ id: "project", path: "/project", name: "Project", isGit: false, lastOpened: 1 }],
        threads: [{ id: "task", projectId: "project", provider: "claude", model: "test", title: "A task", createdAt: 1, updatedAt: 1, running: false, status: "idle", permissionMode: "manual", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, contextTokens: 0, contextMax: 200000, turns: 0 } }],
        providers: [{ id: "claude", label: "Claude Code", available: true, enabled: true, models: [{ id: "test", label: "Example model" }] }],
        permissions: [], home: "/home",
      } }));
      if (delayHello && socket.url().includes(":49121/")) { releaseHello = sendHello; helloReady.resolve(); }
      else sendHello();
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.getByRole("button", { name: "Settings", exact: true }).waitFor();
    return { page, errors, helloReady: helloReady.promise, releaseHello: () => releaseHello?.(), historyReady: historyReady.promise, releaseHistory: () => releaseHistory?.() };
  }

  await t.test("switching retains the current workspace until the destination snapshot is ready", async () => {
    const { page, errors, helloReady, releaseHello, historyReady, releaseHistory } = await open("local", true);
    await page.evaluate(async () => {
      const { selectEnvironment } = await import("/web/src/lib/environment.ts");
      window.navigationNodes = [document.querySelector(".topbar"), document.querySelector(".rail")];
      window.selection = selectEnvironment("ssh-test", "project", "task");
    });
    await page.waitForFunction(() => window.releaseSnapshot);
    await page.evaluate(() => window.releaseSnapshot());
    await helloReady;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(async () => {
      const { environmentId } = await import("/web/src/lib/environment.ts");
      const { useApp } = await import("/web/src/lib/store.ts");
      return [environmentId(), useApp.getState().connected, useApp.getState().threadOrder.length];
    }), ["local", true, 1]);
    releaseHello();
    await historyReady;
    assert.equal(await page.evaluate(async () => (await import("/web/src/lib/environment.ts")).environmentId()), "local");
    releaseHistory();
    await page.evaluate(() => window.selection);
    assert.equal(await page.evaluate(async () => (await import("/web/src/lib/environment.ts")).environmentId()), "ssh-test");
    assert.equal(await page.evaluate(() => window.navigationNodes.every(node => node?.isConnected)), true);
    assert.deepEqual(await page.evaluate(async () => {
      const state = (await import("/web/src/lib/store.ts")).useApp.getState();
      return [state.activeThreadId, state.loaded.task];
    }), ["task", true]);
    assert.deepEqual(errors, []);
    await page.close();
  });

  const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  for (const [startingEnvironment, description] of [["ssh-test", "reconnecting to the active host"], ["local", "switching to another host"]]) {
    await t.test(description, async () => {
      const { page, errors } = await open(startingEnvironment);
      const banner = page.locator(".remote-connection-banner");
      await page.evaluate(async () => {
        const { selectEnvironment } = await import("/web/src/lib/environment.ts");
        window.selection = selectEnvironment("ssh-test");
      });
      await page.waitForFunction(() => window.releaseSnapshot);
      await page.evaluate(() => window.citropyDesktop.disconnectEnvironment("ssh-test"));
      await page.evaluate(() => window.releaseSnapshot());
      await page.evaluate(() => window.selection);
      await settle(page);
      assert.equal(await banner.count(), 1);
      await page.evaluate(() => window.showConnectionProgress());
      for (const width of [1440, 620]) {
        await page.setViewportSize({ width, height: 900 });
        const notice = await banner.boundingBox();
        const body = await page.locator(".shell-body").boundingBox();
        assert.ok(notice.height < 130, JSON.stringify(notice));
        assert.ok(body.y < 90, JSON.stringify(body));
        assert.ok(notice.x >= 0 && notice.x + notice.width <= width + 1);
        await page.screenshot({ path: `/tmp/citropy-connection-notice-${width}.png`, animations: "disabled" });
      }
      assert.deepEqual(errors, []);
      await page.close();
    });
  }
});
