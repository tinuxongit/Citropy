import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import { join, dirname } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";

test(
  "provider maintenance and global instructions use the real installation and preserve user files",
  { timeout: 60000 },
  async (t) => {
    const home = fs.mkdtempSync(
      join(os.tmpdir(), "citropy-provider-settings-"),
    );
    const originalHome = os.homedir;
    const originalEnv = { ...process.env };
    const originalFetch = globalThis.fetch;
    let latest = "1.1.0";
    let standaloneLatest = "1.1.0";
    let cursorLatest = "1.0.0";
    let cursorChecks = 0;
    const versionChecks = [];
    let versionGate = Promise.resolve();
    let installerDownloads = 0;
    let installer = '#!/bin/sh\nexec "$CODEX_INSTALL_DIR/codex" standalone-install';
    globalThis.fetch = (input, options) => {
      if (String(input) === "https://releases.openai.com/codex/channels/latest") {
        versionChecks.push(String(input));
        return versionGate.then(() => Response.json({ tag_name: `rust-v${standaloneLatest}` }));
      }
      if (String(input).startsWith("https://registry.npmjs.org/")) {
        versionChecks.push(String(input));
        return versionGate.then(() => Response.json({ version: latest }));
      }
      if (String(input) === "https://chatgpt.com/codex/install.sh") {
        installerDownloads++;
        return Promise.resolve(new Response(installer));
      }
      if (String(input) === "https://cursor.com/install") {
        cursorChecks++;
        return Promise.resolve(new Response(`FINAL_DIR="$HOME/.local/share/cursor-agent/versions/${cursorLatest}"`));
      }
      return originalFetch(input, options);
    };
    os.homedir = () => home;
    process.env.CODEX_HOME = join(home, "codex-custom");
    delete process.env.CODEX_INSTALL_DIR;
    process.env.CLAUDE_CONFIG_DIR = join(home, "claude-custom");
    process.env.XDG_CONFIG_HOME = join(home, "config-custom");
    process.env.PATH = `${join(home, ".local/bin")}:${join(home, ".opencode/bin")}:${process.env.PATH}`;
    syncBuiltinESMExports();
    const files = [
      join(home, ".local/share/claude/versions/1.0.0"),
      join(home, ".local/bin/codex"),
      join(home, ".local/share/cursor-agent/versions/1.0.0/cursor-agent"),
      join(home, ".opencode/bin/opencode"),
      join(home, ".local/bin/pi"),
    ];
    for (const [index, provider] of ["claude", "codex", "cursor", "opencode", "pi"].entries()) {
      const path = files[index];
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(
        path,
        `#!${process.execPath}\nconst fs = require('node:fs');
const home = ${JSON.stringify(home)};
const provider = ${JSON.stringify(provider)};
const args = process.argv.slice(2);
if (args.includes('--help')) {
  const text = provider === 'opencode' ? 'opencode upgrade [target]' : 'Usage: ' + provider + ' update';
  (provider === 'opencode' ? process.stderr : process.stdout).write(text);
} else if (args[0] === '--version') {
  process.stdout.write(provider + ' ' + (fs.existsSync(home + '/' + provider + '.version') ? fs.readFileSync(home + '/' + provider + '.version', 'utf8') : '1.0.0'));
} else {
  if (args[0] === 'standalone-install' && process.env.CODEX_NON_INTERACTIVE !== '1') process.exit(4);
  fs.appendFileSync(home + '/calls.jsonl', JSON.stringify({ provider, args }) + '\\n');
  const fail = fs.existsSync(home + '/fail');
  process.stdout.write('\\x1b[32m' + 'updater output '.repeat(2000) + '\\x1b[0m');
  setTimeout(() => {
    if (!fail) fs.writeFileSync(home + '/' + provider + '.version', '1.1.0');
    process.exit(fail ? 3 : 0);
  }, 200);
}
`,
        { mode: 0o755 },
      );
    }
    fs.symlinkSync(files[0], join(home, ".local/bin/claude"));
    fs.symlinkSync(files[2], join(home, ".local/bin/cursor-agent"));
    const { readGlobalInstructions, saveGlobalInstructions } = await import(
      "../server/providers/instructions.ts"
    );
    const {
      providerMaintenance,
      startProviderUpdate,
      startProviderUpdates,
      providerUpdating,
      assertProviderReady,
      startProviderUpdateChecks,
      cursorVersionNewer,
    } = await import("../server/providers/maintenance.ts");
    const { store } = await import("../server/store.ts");
    const { handleFeatures } = await import("../server/features.ts");
    const { runtimeFor, disposeAll } = await import("../server/runtime.ts");
    let vite;
    let browser;
    let wss;
    const server = http.createServer(async (req, res) => {
      if (!(await handleFeatures(req, res, []))) {
        if (vite) vite.middlewares(req, res);
        else res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, method = "GET", body, headers = {}) => {
      const response = await fetch(`${origin}/api/providers/${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        data: await response.json().catch(() => null),
      };
    };
    const settle = async (provider) => {
      for (let i = 0; i < 200; i++) {
        if (!providerUpdating(provider))
          return (await providerMaintenance()).find(
            (state) => state.provider === provider,
          );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Update did not finish");
    };
    t.after(async () => {
      await browser?.close();
      wss?.close();
      await vite?.close();
      disposeAll();
      store.flush();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      os.homedir = originalHome;
      process.env = originalEnv;
      globalThis.fetch = originalFetch;
      syncBuiltinESMExports();
      fs.rmSync(home, { recursive: true, force: true });
    });

    await t.test(
      "global files honor config homes, create on save, and preserve exact text and a backup",
      () => {
        const expected = {
          claude: join(home, "claude-custom/CLAUDE.md"),
          codex: join(home, "codex-custom/AGENTS.md"),
          opencode: join(home, "config-custom/opencode/AGENTS.md"),
          cursor: join(home, ".cursor/rules/citropy.mdc"),
          pi: join(home, ".pi/agent/AGENTS.md"),
        };
        for (const provider of ["claude", "codex", "opencode", "cursor", "pi"]) {
          const first = readGlobalInstructions(provider);
          assert.equal(first.path, expected[provider]);
          assert.equal(first.exists, false);
          assert.equal(fs.existsSync(first.path), false);
          const text =
            "# Guidelines\r\n\r\nKeep unicode 🍋 and $LITERALS exactly.\r\n";
          const saved = saveGlobalInstructions(provider, text, first.revision);
          assert.equal(saved.exists, true);
          assert.equal(saved.content, text);
          if (provider === "cursor") {
            assert.equal(
              fs.readFileSync(first.path, "utf8"),
              `---\ndescription: Citropy global instructions\nalwaysApply: true\n---\n${text}`,
            );
          } else {
            assert.equal(fs.readFileSync(first.path, "utf8"), text);
          }
          saveGlobalInstructions(provider, "Next draft", saved.revision);
          assert.equal(
            fs.readFileSync(`${first.path}.citropy-backup`, "utf8"),
            provider === "cursor"
              ? `---\ndescription: Citropy global instructions\nalwaysApply: true\n---\n${text}`
              : text,
          );
        }
      },
    );
    await t.test(
      "outside edits and changing Codex overrides reject stale saves without touching either file",
      () => {
        const base = readGlobalInstructions("codex");
        fs.writeFileSync(base.path, "Edited elsewhere");
        assert.throws(
          () => saveGlobalInstructions("codex", "Stale", base.revision),
          /changed outside/,
        );
        assert.equal(fs.readFileSync(base.path, "utf8"), "Edited elsewhere");
        const fresh = readGlobalInstructions("codex");
        const override = join(dirname(base.path), "AGENTS.override.md");
        fs.writeFileSync(override, "Override");
        assert.equal(readGlobalInstructions("codex").path, override);
        assert.throws(
          () => saveGlobalInstructions("codex", "Stale", fresh.revision),
          /changed outside/,
        );
        assert.equal(fs.readFileSync(override, "utf8"), "Override");
        assert.throws(
          () =>
            saveGlobalInstructions("codex", "x".repeat(65537), fresh.revision),
          /64 KB/,
        );
        assert.throws(
          () => readGlobalInstructions("../../elsewhere"),
          /Unknown provider/,
        );
      },
    );
    await t.test(
      "symlinked instruction files keep the link and update its target",
      () => {
        const path = readGlobalInstructions("claude").path;
        const target = join(home, "personal-instructions.md");
        fs.renameSync(path, target);
        fs.symlinkSync(target, path);
        const file = readGlobalInstructions("claude");
        saveGlobalInstructions(
          "claude",
          "Updated symlink target",
          file.revision,
        );
        assert.equal(fs.lstatSync(path).isSymbolicLink(), true);
        assert.equal(fs.readFileSync(target, "utf8"), "Updated symlink target");
        assert.equal(
          fs.readFileSync(`${target}.citropy-backup`, "utf8"),
          file.content,
        );
      },
    );
    await t.test("provider update checks run at startup and every five minutes without overlapping or installing", async (t) => {
      t.mock.timers.enable({ apis: ["setInterval"] });
      const before = versionChecks.length;
      const stop = startProviderUpdateChecks();
      let release;
      t.after(() => { stop(); release?.(); versionGate = Promise.resolve(); });
      const checked = async count => {
        for (let attempt = 0; attempt < 100 && versionChecks.length < before + count; attempt++)
          await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(versionChecks.length, before + count);
      };
      await checked(4);
      assert.equal(new Set(versionChecks.slice(before)).size, 4);
      await providerMaintenance();
      t.mock.timers.tick(299999);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(versionChecks.length, before + 4);
      t.mock.timers.tick(1);
      await checked(8);
      await providerMaintenance();
      versionGate = new Promise(resolve => { release = resolve; });
      t.mock.timers.tick(300000);
      await checked(12);
      t.mock.timers.tick(300000);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(versionChecks.length, before + 12);
      release();
      await providerMaintenance();
      t.mock.timers.tick(300000);
      await checked(16);
      await providerMaintenance();
      stop();
      t.mock.timers.tick(600000);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(versionChecks.length, before + 16);
      assert.equal(installerDownloads, 0);
      assert.equal(fs.existsSync(join(home, "calls.jsonl")), false);
    });
    await t.test(
      "updates use the owning installer, run only on request, verify versions, and bound output",
      async () => {
        const maintenance = await providerMaintenance();
        assert.ok(maintenance.slice(0, 4).every((entry) => entry.available));
        assert.deepEqual(maintenance.map((entry) => entry.method), ["Native updater", "Standalone installer", "Native updater", "Native updater", undefined]);
        await providerMaintenance(true);
        assert.equal(installerDownloads, 0);
        assert.equal(fs.existsSync(join(home, "calls.jsonl")), false);
        assert.equal(store.notifications.filter((entry) => entry.kind === "update").length, 4);
        assert.ok(store.notifications.every((entry) => entry.target?.view === "settings" && entry.target.section === "Providers"));
        let prepared = 0;
        let refreshed = 0;
        for (const provider of ["claude", "codex", "cursor", "opencode"]) {
          const listeners = process.listenerCount("exit");
          const state = startProviderUpdate(
            provider,
            async () => {
              prepared++;
            },
            async () => {
              refreshed++;
            },
          );
          assert.equal(state.status, "updating");
          assert.throws(() => assertProviderReady(provider), /is updating/);
          assert.throws(
            () =>
              startProviderUpdate(
                provider,
                async () => {},
                async () => {},
              ),
            /current provider update/,
          );
          const done = await settle(provider);
          assert.equal(done.status, "success", done.message);
          assert.equal(done.version, `${provider} 1.1.0`);
          if (provider === "cursor") {
            assert.equal(done.updateStatus, "unknown");
            assert.equal(done.latestVersion, "1.0.0");
          } else {
            assert.equal(done.updateStatus, "current");
            assert.equal(done.latestVersion, "1.1.0");
          }
          assert.ok(done.output.length <= 10000);
          assert.equal(done.output.includes("\x1b"), false);
          assert.equal(process.listenerCount("exit"), listeners);
        }
        assert.equal(prepared, 4);
        assert.equal(refreshed, 4);
        const calls = fs
          .readFileSync(join(home, "calls.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map(JSON.parse);
        assert.deepEqual(
          calls.map(({ args }) => args),
          [["update"], ["standalone-install"], ["update"], ["upgrade"]],
        );
        assert.equal(installerDownloads, 1);
        assert.ok(cursorChecks >= 1, "the Cursor install manifest is checked");
        assert.equal(cursorVersionNewer("2026.08.31-4057e58", "2026.09.15-d2fe57e"), true);
        assert.equal(cursorVersionNewer("2026.09.15-d2fe57e", "2026.09.15-d2fe57e"), false);
        assert.equal(cursorVersionNewer("cursor 1.0.0", "1.1.0"), undefined);
      },
    );
    await t.test("invalid installer downloads leave the installed CLI untouched and release the update lock", async () => {
      const validInstaller = installer;
      installer = "<html>Temporary service error</html>";
      const calls = fs.readFileSync(join(home, "calls.jsonl"), "utf8");
      try {
        startProviderUpdate("codex", async () => {}, async () => assert.fail("Must not report refreshed"));
        const state = await settle("codex");
        assert.equal(state.status, "error");
        assert.match(state.message, /installer response was invalid/);
        assert.equal(fs.readFileSync(join(home, "calls.jsonl"), "utf8"), calls);
        assert.equal(fs.readFileSync(join(home, "codex.version"), "utf8"), "1.1.0");
        assertProviderReady("codex");
      } finally {
        installer = validInstaller;
      }
    });
    await t.test("standalone Codex checks the installer's release channel", async () => {
      latest = "1.2.0";
      try {
        const state = (await providerMaintenance(true)).find(entry => entry.provider === "codex");
        assert.equal(state.latestVersion, "1.1.0");
        assert.equal(state.updateStatus, "current");
      } finally {
        latest = "1.1.0";
      }
    });
    await t.test("an unchanged CLI does not report a successful update when a newer release is available", async () => {
      const previousInstaller = installer;
      installer = "#!/bin/sh\nexit 0";
      standaloneLatest = "1.2.0";
      try {
        let refreshed = false;
        startProviderUpdate("codex", async () => {}, async () => { refreshed = true; });
        const state = await settle("codex");
        assert.equal(state.status, "error");
        assert.equal(refreshed, false);
        assert.equal(state.version, "codex 1.1.0");
        assert.equal(state.latestVersion, "1.2.0");
        assert.equal(state.updateStatus, "available");
        assert.match(state.message, /still reports codex 1\.1\.0.*1\.2\.0 is available/);
      } finally {
        installer = previousInstaller;
        standaloneLatest = "1.1.0";
      }
    });
    await t.test("update notifications are emitted once per release and survive being marked read", async () => {
      const { notifyUpdateAvailable } = await import("../server/update-notifications.ts");
      notifyUpdateAvailable("Citropy", "0.2.0", "Application");
      const notification = store.notifications.find(entry => entry.dedupeKey === "update:Citropy:0.2.0");
      assert.ok(notification);
      assert.deepEqual(notification.target, { view: "settings", section: "Application" });
      store.readNotifications([notification.id]);
      notifyUpdateAvailable("Citropy", "0.2.0", "Application");
      assert.equal(store.notifications.filter(entry => entry.dedupeKey === notification.dedupeKey).length, 1);
      assert.equal(store.notifications.find(entry => entry.id === notification.id).read, true);
      notifyUpdateAvailable("Citropy", "invalid version", "Application");
      assert.equal(store.notifications.some(entry => entry.text.includes("invalid version")), false);
      notifyUpdateAvailable("Cursor", "2026.09.15-d2fe57e", "Providers");
      const cursor = store.notifications.find(entry => entry.dedupeKey === "update:Cursor:2026.09.15-d2fe57e");
      assert.ok(cursor);
      assert.deepEqual(cursor.target, { view: "settings", section: "Providers" });
      notifyUpdateAvailable("Citropy", "0.3.0", "Application");
      assert.equal(store.notifications.filter(entry => entry.target.section === "Application").length, 2);
    });
    await t.test(
      "failed updates release the lock and preserve the installed version",
      async () => {
        fs.writeFileSync(join(home, "fail"), "");
        startProviderUpdate(
          "codex",
          async () => {},
          async () => assert.fail("Must not report refreshed"),
        );
        const state = await settle("codex");
        assert.equal(state.status, "error");
        assert.match(state.message, /code 3/);
        assert.equal(
          fs.readFileSync(join(home, "codex.version"), "utf8"),
          "1.1.0",
        );
        assertProviderReady("codex");
        fs.rmSync(join(home, "fail"));
      },
    );
    await t.test(
      "HTTP routes reject cross-origin, unknown providers, active work, and stale instructions",
      async () => {
        assert.equal(
          (
            await call("instructions?provider=codex", "GET", undefined, {
              origin: "https://example.com",
            })
          ).status,
          403,
        );
        assert.equal((await call("instructions?provider=unknown")).status, 400);
        const project = store.openProject(home);
        const thread = store.createThread({
          projectId: project.id,
          provider: "codex",
          title: "Active",
          permissionMode: "manual",
        });
        store.patchThread(thread.id, { running: true, status: "working" });
        const file = (await call("instructions?provider=codex")).data;
        assert.match(
          (await call("update", "POST", { provider: "codex" })).data.error,
          /active conversations/,
        );
        assert.match(
          (
            await call("instructions?provider=codex", "PUT", {
              content: "No",
              revision: file.revision,
            })
          ).data.error,
          /active conversations/,
        );
        store.patchThread(thread.id, { running: false, status: "idle" });
        let release;
        startProviderUpdate(
          "codex",
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
          async () => {},
        );
        await assert.rejects(runtimeFor(thread.id).send("Wait"), /updating/);
        assert.equal(thread.messages.length, 0);
        assert.match(
          (
            await call("instructions?provider=codex", "PUT", {
              content: "No",
              revision: file.revision,
            })
          ).data.error,
          /updating/,
        );
        release();
        await settle("codex");
        assert.equal(
          (
            await call("instructions?provider=codex", "PUT", {
              content: "Saved from UI",
              revision: file.revision,
            })
          ).status,
          200,
        );
        assert.match(
          (
            await call("instructions?provider=codex", "PUT", {
              content: "Stale",
              revision: file.revision,
            })
          ).data.error,
          /changed outside/,
        );
      },
    );

    await t.test(
      "provider settings update CLIs and edit instructions at desktop and narrow widths",
      async () => {
        fs.writeFileSync(join(home, "codex.version"), "1.0.0");
        fs.writeFileSync(join(home, "claude.version"), "1.0.0");
        await providerMaintenance(true);
        vite = await createServer({
          configFile: false,
          cacheDir: join(home, "cache"),
          root: fileURLToPath(new URL("..", import.meta.url)),
          plugins: [react()],
          logLevel: "error",
          server: { middlewareMode: true, hmr: { server }, watch: null },
        });
        const catalog = ["claude", "codex", "opencode"].map((id) => ({
          id,
          label: {
            claude: "Claude Code",
            codex: "Codex",
            opencode: "OpenCode",
          }[id],
          binary: id,
          version: "1.0.0",
          available: true,
          enabled: true,
          models: [],
        }));
        wss = new WebSocketServer({ noServer: true });
        server.on("upgrade", (request, socket, head) => {
          if (new URL(request.url, origin).pathname === "/socket")
            wss.handleUpgrade(request, socket, head, (connection) => wss.emit("connection", connection));
        });
        const { bus } = await import("../server/bus.ts");
        wss.on("connection", (socket) => {
          const send = (event) => {
            if (socket.readyState === socket.OPEN)
              socket.send(JSON.stringify(event));
          };
          send({
            t: "hello",
            snapshot: {
              projects: [...store.projects.values()],
              threads: store.allMeta(),
              providers: catalog,
              permissions: [],
              home,
            },
          });
          const unsubscribe = bus.subscribe(send);
          socket.on("close", unsubscribe);
          socket.on("message", (raw) => {
            const event = JSON.parse(raw);
            if (event.t === "thread.load")
              send({
                t: "thread.messages",
                threadId: event.id,
                messages: store.threads.get(event.id)?.messages ?? [],
              });
          });
        });
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1050 },
        });
        page.setDefaultTimeout(20000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript(() => {
          localStorage.setItem("citropy.theme", "dark");
          localStorage.setItem("citropy.uiScale", "120");
        });
        await page.addInitScript(endpoint => {
          const state = { activeId: "local", endpoint: "", connections: [{ id: "test-ssh", name: "Build server", target: "builder@example", status: "connected" }] };
          window.environmentSelections = [];
          window.citropyDesktop = {
            onBrowserSelect: () => () => {},
            environmentsState: async () => state,
            onEnvironmentsState: () => () => {},
            connectEnvironment: async id => {
              window.environmentSelections.push(id);
              return { ...state, activeId: id, endpoint: id === "local" ? "" : endpoint, connections: state.connections.map(connection => ({ ...connection, endpoint: id === connection.id ? endpoint : undefined })) };
            },
          };
        }, origin);
        await page.goto(origin);
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        const failedBadge = page.getByRole("switch", { name: /Show failed-tools badge/ });
        assert.equal(await failedBadge.isChecked(), true);
        await failedBadge.click();
        assert.equal(await page.evaluate(() => localStorage.getItem("citropy.showFailedTools")), "0");
        await failedBadge.click();
        await page
          .getByRole("button", { name: "Providers", exact: true })
          .click();
        const environment = page.getByRole("combobox", { name: "Provider environment" });
        await environment.selectOption("test-ssh");
        await page.waitForFunction(() => document.querySelector('[aria-label="Provider environment"]')?.value === "test-ssh");
        await page.getByRole("region", { name: "Codex", exact: true }).waitFor();
        await environment.selectOption("local");
        await page.waitForFunction(() => document.querySelector('[aria-label="Provider environment"]')?.value === "local");
        assert.deepEqual(await page.evaluate(() => window.environmentSelections), ["test-ssh", "local"]);
        const codex = page.getByRole("region", { name: "Codex", exact: true });
        const update = codex.getByRole("button", { name: "Update Codex" });
        await update.waitFor();
        await page.waitForFunction(
          () => !document.querySelector('[aria-label="Update Codex"]').disabled,
        );
        await update.click();
        await codex.getByText("Updating…", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Update Claude Code" })
            .isDisabled(),
          true,
        );
        await page.waitForFunction(
          () =>
            document
              .querySelector('[aria-label="Codex"] .provider-update-result')
              ?.getAttribute("data-status") === "success",
        );
        await codex.getByText("Up to date", { exact: true }).waitFor();
        assert.equal(await codex.getByRole("button", { name: "Update Codex" }).count(), 0);
        await page.getByRole("button", { name: "Check for updates", exact: true }).click();
        await codex.getByText("Up to date", { exact: true }).waitFor();
        assert.equal(await codex.getByRole("button", { name: "Update Codex" }).count(), 0);
        await page.screenshot({
          path: "/tmp/citropy-provider-settings-desktop.png",
          animations: "disabled",
        });
        await codex
          .getByRole("button", { name: /Global instructions/ })
          .click();
        const dialog = page.getByRole("dialog", { name: "Codex instructions" });
        const editor = dialog.getByRole("textbox", {
          name: "Codex global instructions",
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[aria-label="Codex global instructions"]')
              ?.value === "Saved from UI",
        );
        await editor.fill(
          "# Personal guidance\n\nUse focused tests and readable code.\n",
        );
        await dialog.getByRole("button", { name: "Save instructions" }).click();
        await dialog.getByText("Saved", { exact: true }).waitFor();
        assert.equal(
          readGlobalInstructions("codex").content,
          "# Personal guidance\n\nUse focused tests and readable code.\n",
        );
        await page.screenshot({
          path: "/tmp/citropy-provider-instructions-desktop.png",
          animations: "disabled",
        });
        const file = readGlobalInstructions("codex");
        await editor.fill("Keep my draft");
        fs.writeFileSync(file.path, "Saved outside the app");
        await dialog.getByRole("button", { name: "Save instructions" }).click();
        await dialog
          .getByRole("alert")
          .filter({ hasText: "changed outside" })
          .waitFor();
        assert.equal(await editor.inputValue(), "Keep my draft");
        assert.equal(
          readGlobalInstructions("codex").content,
          "Saved outside the app",
        );
        await dialog.getByRole("button", { name: "Reload file" }).click();
        await page
          .getByRole("button", { name: "Discard draft", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('[aria-label="Codex global instructions"]')
              ?.value === "Saved outside the app",
        );
        await page.setViewportSize({ width: 600, height: 900 });
        await page.screenshot({
          path: "/tmp/citropy-provider-instructions-narrow.png",
          animations: "disabled",
        });
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 601);
        assert.ok(
          await dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        );
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await page.getByRole("button", { name: "Toggle sidebar" }).click();
        await page.screenshot({
          path: "/tmp/citropy-provider-settings-narrow.png",
          animations: "disabled",
        });
        assert.ok(
          await page
            .locator(".settings")
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
        );
        assert.deepEqual(errors, []);
        let installRequests = 0;
        let installationFinished = false;
        await page.route("**/api/providers/maintenance*", async route => {
          const entries = await providerMaintenance();
          await route.fulfill({ json: entries.map(entry => entry.provider === "codex"
            ? { ...entry, available: true, install: !installationFinished, status: installRequests && !installationFinished ? "updating" : "idle", updateStatus: installationFinished ? "current" : "unknown" }
            : entry) });
        });
        await page.route("**/api/providers/update", async route => {
          assert.deepEqual(route.request().postDataJSON(), { provider: "codex" });
          installRequests++;
          await route.fulfill({ json: { provider: "codex", available: true, install: true, status: "updating", message: "Installing provider…" } });
        });
        await page.setViewportSize({ width: 1440, height: 1050 });
        await page.getByRole("button", { name: "Check for updates", exact: true }).click();
        const install = page.getByRole("button", { name: "Install Codex", exact: true });
        await install.waitFor();
        assert.equal(await install.innerText(), "Install");
        await environment.scrollIntoViewIfNeeded();
        await page.screenshot({ path: "/tmp/citropy-provider-install-desktop.png" });
        await page.setViewportSize({ width: 590, height: 920 });
        await environment.scrollIntoViewIfNeeded();
        await page.screenshot({ path: "/tmp/citropy-provider-install-narrow.png" });
        await install.click();
        await codex.getByText("Installing…", { exact: true }).waitFor();
        assert.equal(await install.isDisabled(), true);
        assert.equal(installRequests, 1);
        installationFinished = true;
        await codex.getByText("Up to date", { exact: true }).waitFor();
        let batchRequests = 0;
        await page.route("**/api/providers/update-all", async route => {
          batchRequests++;
          await route.fulfill({ json: [] });
        });
        await page.getByRole("button", { name: "Update all", exact: true }).click();
        assert.equal(batchRequests, 1);
        let runtimeRequests = 0;
        let runtimeReady = false;
        await page.route("**/api/runtimes/node", async route => {
          if (route.request().method() === "POST") {
            runtimeRequests++;
            assert.equal(route.request().url(), origin + "/api/runtimes/node");
          }
          await route.fulfill({ json: {
            status: runtimeReady ? "success" : runtimeRequests ? "installing" : "idle",
            ready: runtimeReady, shellReady: runtimeRequests > 1, supported: true, installVersion: "22.23.2",
            version: runtimeReady ? "v22.23.2" : undefined, npmVersion: runtimeReady ? "10.9.8" : undefined,
            message: runtimeReady ? "Node.js and npm are ready." : runtimeRequests ? "Downloading Node.js and npm…" : undefined,
          } });
        });
        await page.setViewportSize({ width: 1440, height: 1050 });
        await environment.selectOption("test-ssh");
        const installNode = page.getByRole("button", { name: "Install Node.js", exact: true });
        await installNode.waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("Install Node.js") && !button.disabled));
        await installNode.scrollIntoViewIfNeeded();
        await page.screenshot({ path: "/tmp/citropy-runtime-downloads-desktop.png", animations: "disabled" });
        await page.setViewportSize({ width: 590, height: 920 });
        await installNode.scrollIntoViewIfNeeded();
        await page.screenshot({ path: "/tmp/citropy-runtime-downloads-narrow.png", animations: "disabled" });
        await installNode.click();
        await page.getByText("Downloading Node.js and npm…", { exact: true }).waitFor();
        assert.equal(runtimeRequests, 1);
        runtimeReady = true;
        await page.getByText("Node v22.23.2 · npm 10.9.8", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Install Node.js", exact: true }).count(), 0);
        const setupTerminals = page.getByRole("button", { name: "Set up terminals", exact: true });
        await setupTerminals.click();
        await page.getByText("Installed", { exact: true }).waitFor();
        assert.equal(runtimeRequests, 2);
        await page.close();
      },
    );
    await t.test("managed standalone installations keep their update method after the first install", async () => {
      const binary = join(home, ".local/bin/codex");
      const original = fs.readFileSync(binary);
      const target = join(process.env.CODEX_HOME, "packages/standalone/releases/1.1.0/codex");
      fs.mkdirSync(dirname(target), { recursive: true });
      fs.writeFileSync(target, original, { mode: 0o755 });
      fs.rmSync(binary);
      fs.symlinkSync(target, binary);
      try {
        const state = (await providerMaintenance(true)).find(entry => entry.provider === "codex");
        assert.equal(state.method, "Standalone installer");
        assert.equal(state.available, true);
        assert.equal(state.updateStatus, "current");
      } finally {
        fs.rmSync(binary);
        fs.writeFileSync(binary, original, { mode: 0o755 });
      }
    });
    await t.test(
      "npm updates the owning prefix and unrecognized installations stay manual",
      async () => {
        const binary = join(home, ".local/bin/codex");
        const original = fs.readFileSync(binary);
        const prefix = join(home, "node install; $literal");
        const owned = join(
          prefix,
          "lib/node_modules/@openai/codex/bin/codex.js",
        );
        const npm = join(home, ".local/bin/npm");
        fs.mkdirSync(dirname(owned), { recursive: true });
        fs.writeFileSync(owned, original, { mode: 0o755 });
        fs.rmSync(binary);
        fs.symlinkSync(owned, binary);
        fs.writeFileSync(
          npm,
          `#!${process.execPath}\nconst fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(join(home, "npm-args.json"))}, JSON.stringify(process.argv.slice(2))); fs.writeFileSync(${JSON.stringify(join(home, "codex.version"))}, '1.2.0'); process.stdout.write('Updated the owned installation.');`,
          { mode: 0o755 },
        );
        startProviderUpdate(
          "codex",
          async () => {},
          async () => {},
        );
        const updated = await settle("codex");
        assert.equal(updated.status, "success", updated.message);
        assert.equal(updated.method, "npm");
        assert.equal(updated.version, "codex 1.2.0");
        assert.deepEqual(
          JSON.parse(fs.readFileSync(join(home, "npm-args.json"), "utf8")),
          [
            "install",
            "--global",
            "--prefix",
            prefix,
            "--allow-scripts=@openai/codex",
            "@openai/codex@latest",
          ],
        );
        const external = join(home, "another-installer-codex");
        fs.writeFileSync(external, original, { mode: 0o755 });
        fs.rmSync(binary);
        fs.symlinkSync(external, binary);
        startProviderUpdate(
          "codex",
          async () => {},
          async () => {},
        );
        const manual = await settle("codex");
        assert.equal(manual.status, "error");
        assert.equal(manual.available, false);
        assert.match(manual.reason, /original installer/);
        assert.equal(
          fs.readFileSync(join(home, "codex.version"), "utf8"),
          "1.2.0",
        );
        fs.rmSync(binary);
        fs.writeFileSync(binary, original, { mode: 0o755 });
        fs.rmSync(npm);
      },
    );
    await t.test("bulk updates run sequentially, retain their lock, and continue after a failure", async () => {
      let release;
      const order = [];
      const gate = new Promise(resolve => { release = resolve; });
      const queued = startProviderUpdates(["claude", "codex"], async provider => {
        order.push(provider);
        if (provider === "claude") {
          await gate;
          throw new Error("Provider became busy");
        }
      }, async () => {});
      assert.equal(queued.length, 2);
      assert.equal(providerUpdating("codex"), true);
      assert.deepEqual(order, ["claude"]);
      assert.throws(() => startProviderUpdate("cursor", async () => {}, async () => {}), /Wait for/);
      release();
      assert.equal((await settle("claude")).status, "error");
      assert.equal((await settle("codex")).status, "success");
      assert.deepEqual(order, ["claude", "codex"]);
    });
    await t.test("update-all skips active and current providers on the backend", async () => {
      latest = "1.1.0";
      fs.writeFileSync(join(home, "claude.version"), "1.0.0");
      fs.writeFileSync(join(home, "opencode.version"), "1.0.0");
      const project = store.openProject(home);
      const thread = store.createThread({ projectId: project.id, provider: "opencode", title: "Busy provider", permissionMode: "manual" });
      store.patchThread(thread.id, { running: true, status: "working" });
      try {
        const response = await call("update-all", "POST");
        assert.equal(response.status, 200);
        const ids = response.data.map(entry => entry.provider);
        assert.ok(ids.includes("claude"));
        assert.ok(!ids.includes("codex"));
        assert.ok(!ids.includes("opencode"));
        for (const id of ids) assert.equal((await settle(id)).status, "success");
      } finally {
        store.patchThread(thread.id, { running: false, status: "idle" });
      }
    });
    await t.test(
      "backup links never overwrite their targets and broken instruction links are preserved",
      () => {
        const file = readGlobalInstructions("opencode");
        const outside = join(home, "unrelated.txt");
        fs.writeFileSync(outside, "Keep this file");
        fs.rmSync(`${file.path}.citropy-backup`, { force: true });
        fs.symlinkSync(outside, `${file.path}.citropy-backup`);
        saveGlobalInstructions("opencode", "A new draft", file.revision);
        assert.equal(fs.readFileSync(outside, "utf8"), "Keep this file");
        assert.equal(
          fs.readFileSync(`${file.path}.citropy-backup`, "utf8"),
          file.content,
        );
        fs.rmSync(file.path);
        fs.symlinkSync(join(home, "missing-instructions"), file.path);
        assert.throws(() => readGlobalInstructions("opencode"), /missing file/);
        assert.equal(fs.lstatSync(file.path).isSymbolicLink(), true);
      },
    );
  },
);
