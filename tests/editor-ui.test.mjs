import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test(
  "editor keeps code, media and terminals together with resizable panes",
  { timeout: 120000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "citropy-editor-ui-"));
    const server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL("..", import.meta.url)),
      plugins: [react()],
      logLevel: "error",
      cacheDir: join(directory, "cache"),
      server: { host: "127.0.0.1", port: 0, watch: null },
    });
    await server.listen();
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    });
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("citropy.project", "project");
      localStorage.setItem("citropy.inspector", "1");
      localStorage.setItem("citropy.uiScale", "100");
    });
    let text = 'export const greeting = "Hello, world";\n';
    let conflict = false;
    let writes = 0;
    const terminalEvents = [];
    let stream = 0;
    let terminalCount = 0;
    const workspacePanels = [];
    const video = await readFile(new URL("./fixtures/editor-preview.webm", import.meta.url));
    const picture = await readFile(new URL("./fixtures/editor-preview.png", import.meta.url));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/editor/search")
        return route.fulfill({ json: [{ path: "settings.json", dir: false }] });
      if (url.pathname === "/api/editor/tree")
        return route.fulfill({
          json:
            url.searchParams.get("path") === "src"
              ? [{ path: "src/helper.ts", name: "helper.ts", dir: false }]
              : [
                  { path: "src", name: "src", dir: true },
                  { path: "hello.ts", name: "hello.ts", dir: false },
                  { path: "settings.json", name: "settings.json", dir: false },
                  { path: "diagram.png", name: "diagram.png", dir: false },
                  { path: "demo.webm", name: "demo.webm", dir: false },
                ],
        });
      if (url.pathname === "/api/preview") {
        const path = url.searchParams.get("path");
        return route.fulfill({ json: { path, name: path, mime: path === "demo.webm" ? "video/webm" : "image/png", size: path === "demo.webm" ? video.length : picture.length } });
      }
      if (url.pathname === "/api/assets")
        return route.fulfill(url.searchParams.get("path") === "demo.webm"
          ? { contentType: "video/webm", body: video }
          : { contentType: "image/png", body: picture });
      if (url.pathname === "/api/editor/file") {
        if (route.request().method() === "PUT") {
          writes++;
          if (conflict)
            return route.fulfill({
              status: 400,
              json: {
                error:
                  "This file changed on disk. Your draft is safe. Reload the file before saving again.",
              },
            });
          text = route.request().postDataJSON().text;
        }
        return route.fulfill({
          json: {
            text:
              url.searchParams.get("path") === "settings.json"
                ? '{"enabled":true}\n'
                : text,
            revision: "a".repeat(64),
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.routeWebSocket("**/socket", (socket) => {
      socket.onMessage((message) => {
        const event = JSON.parse(message.toString());
        if (event.t.startsWith("term.") || event.t.startsWith("panel."))
          terminalEvents.push(event);
        if (event.t === "panel.open" && ["files", "terminal"].includes(event.kind)) {
          const panel = {
            id: event.id,
            projectId: event.projectId,
            threadId: event.threadId,
            kind: event.kind,
            title: event.kind === "terminal" ? `Terminal ${++terminalCount}` : "Files",
          };
          workspacePanels.push(panel);
          socket.send(
            JSON.stringify({
              t: "panel.upsert",
              background: event.background,
              panel,
            }),
          );
        }
        if (event.t === "panel.rename") {
          const panel = workspacePanels.find((panel) => panel.id === event.id);
          panel.title = event.title;
          socket.send(JSON.stringify({ t: "panel.upsert", panel, background: true }));
        }
        if (event.t === "panel.move") {
          const [panel] = workspacePanels.splice(workspacePanels.findIndex((panel) => panel.id === event.id), 1);
          const index = workspacePanels.findIndex((panel) => panel.id === event.targetId);
          workspacePanels.splice(index + (event.edge === "after" ? 1 : 0), 0, panel);
          socket.send(JSON.stringify({ t: "panel.order", projectId: event.projectId ?? "project", ids: workspacePanels.map((panel) => panel.id) }));
        }
        if (event.t === "panel.close") {
          workspacePanels.splice(workspacePanels.findIndex((panel) => panel.id === event.id), 1);
          socket.send(JSON.stringify({ t: "panel.remove", id: event.id }));
        }
        if (event.t === "term.open")
          socket.send(
            JSON.stringify({
              t: "term.data",
              termId: event.termId,
              data: "workspace $ ",
              reset: true,
              streamId: `stream-${++stream}`,
            }),
          );
      });
      socket.send(
        JSON.stringify({
          t: "hello",
          snapshot: {
            projects: [
              {
                id: "project",
                name: "Editor demo",
                path: "/project",
                isGit: false,
                lastOpened: 1,
              },
            ],
            threads: [],
            providers: [],
            permissions: [],
            home: "/home",
            panels: [],
          },
        }),
      );
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page
      .getByRole("button", { name: "Open panel", exact: true })
      .waitFor();
    assert.equal(
      requests.some((url) => /monaco|EditorWorkspace/.test(url)),
      false,
    );
    assert.equal(await page.locator(".workbench-tabs").getByRole("tab").count(), 0);
    assert.deepEqual(terminalEvents.filter((event) => event.t === "panel.open"), []);
    const openFiles = page.getByRole("button", { name: "Open files", exact: true });
    await openFiles.click();
    await page.getByRole("button", { name: "src", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close Files", exact: true }).click();
    await openFiles.waitFor();
    assert.equal(await page.locator(".workbench-tabs").getByRole("tab").count(), 0);
    assert.deepEqual(terminalEvents.filter((event) => event.t === "panel.open").map((event) => event.kind), ["files"]);
    await page.screenshot({ path: "/tmp/citropy-workspace-empty.png", animations: "disabled" });
    await openFiles.click();
    await page.getByRole("button", { name: "src", exact: true }).click();
    await page
      .getByRole("button", { name: "helper.ts", exact: true })
      .waitFor();
    assert.equal(requests.some(url => /monaco/.test(url)), false);
    await page.getByRole("button", { name: "diagram.png", exact: true }).click();
    await page.locator(".editor-document img").waitFor();
    assert.equal(requests.some(url => /monaco/.test(url)), false);
    await page.getByRole("button", { name: "Close diagram.png", exact: true }).click();
    await page.getByRole("button", { name: "hello.ts", exact: true }).click();
    const inspector = page.locator(".inspector");
    assert.equal(await page.locator(".workbench-heading").getByRole("button", { name: "Expand workspace", exact: true }).count(), 1);
    assert.equal(await page.locator(".editor-toolbar").getByRole("button", { name: /Expand|Restore/ }).count(), 0);
    await page.waitForFunction(() => document.querySelector(".view-lines") !== null);
    assert.match(await page.locator(".view-lines").evaluate(element => getComputedStyle(element).fontFamily), /Droid Sans Mono/);
    assert.equal(requests.some(url => /geist-mono/.test(url)), false);
    const resize = page.getByRole("separator", {
      name: "Inspector width",
      exact: true,
    });
    const grip = await resize.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(300, grip.y + grip.height / 2, { steps: 8 });
    await page.mouse.up();
    const wide = await inspector.boundingBox();
    assert.ok(
      wide.width > 1000,
      `Inspector should use the wide window: ${wide.width}`,
    );
    assert.ok(wide.x >= 360);
    await resize.press("End");
    assert.ok((await inspector.boundingBox()).width > 1000);
    await page.screenshot({
      path: "/tmp/citropy-workspace-wide.png",
      animations: "disabled",
    });

    await page
      .getByRole("button", { name: "Expand workspace", exact: true })
      .click();
    const explorerResize = page.getByRole("separator", { name: "File explorer size", exact: true });
    const tree = page.locator(".editor-explorer");
    const explorerStart = await tree.boundingBox();
    const explorerGrip = await explorerResize.boundingBox();
    await page.mouse.move(explorerGrip.x + explorerGrip.width / 2, explorerGrip.y + 100);
    await page.mouse.down();
    await page.mouse.move(explorerGrip.x - 220, explorerGrip.y + 100, { steps: 10 });
    await page.mouse.up();
    assert.ok((await tree.boundingBox()).width > explorerStart.width + 200);
    await explorerResize.press("ArrowLeft");
    const resizedExplorer = (await tree.boundingBox()).width;
    const cancelGrip = await explorerResize.boundingBox();
    await page.mouse.move(cancelGrip.x + 4, cancelGrip.y + 100);
    await page.mouse.down();
    await page.mouse.move(cancelGrip.x + 100, cancelGrip.y + 100, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.ok(Math.abs((await tree.boundingBox()).width - resizedExplorer) < 2);
    assert.equal(Number(await explorerResize.getAttribute("aria-valuenow")), Math.round(resizedExplorer));
    await page
      .getByRole("button", { name: "Open terminal", exact: true })
      .click();
    const dock = page.getByRole("region", {
      name: "Editor terminal",
      exact: true,
    });
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    const firstTerminal = await dock.locator(".xterm").elementHandle();
    const terminalScreen = dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen");
    const resizeCount = () => terminalEvents.filter(event => event.t === "term.resize").length;
    const settleTerminal = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await settleTerminal();
    const terminalResize = page.getByRole("separator", { name: "Terminal height", exact: true });
    const dockStart = await dock.boundingBox();
    const terminalGrip = await terminalResize.boundingBox();
    const gridBeforeDrag = await terminalScreen.boundingBox();
    const resizesBeforeDrag = resizeCount();
    await page.mouse.move(terminalGrip.x + 100, terminalGrip.y + 4);
    await page.mouse.down();
    await page.mouse.move(terminalGrip.x + 100, terminalGrip.y - 100, { steps: 10 });
    await page.waitForTimeout(250);
    assert.ok((await dock.boundingBox()).height > dockStart.height + 90);
    assert.equal((await terminalScreen.boundingBox()).height, gridBeforeDrag.height);
    assert.equal(resizeCount(), resizesBeforeDrag);
    await page.mouse.up();
    await page.waitForFunction(height => document.querySelector('.editor-terminal-body:not([hidden]) .xterm-screen').getBoundingClientRect().height > height, gridBeforeDrag.height);
    await settleTerminal();
    assert.equal(resizeCount(), resizesBeforeDrag + 1);
    await terminalResize.press("ArrowUp");
    const resizedTerminal = (await dock.boundingBox()).height;
    await settleTerminal();
    const cancelTerminalGrid = await terminalScreen.boundingBox();
    const resizesBeforeCancel = resizeCount();
    const explorerWithTerminal = await explorerResize.boundingBox();
    await page.mouse.move(explorerWithTerminal.x + 4, explorerWithTerminal.y + 100);
    await page.mouse.down();
    await page.mouse.move(explorerWithTerminal.x + 84, explorerWithTerminal.y + 100, { steps: 8 });
    await settleTerminal();
    assert.equal((await terminalScreen.boundingBox()).width, cancelTerminalGrid.width);
    assert.equal(resizeCount(), resizesBeforeCancel);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await settleTerminal();
    assert.equal((await terminalScreen.boundingBox()).width, cancelTerminalGrid.width);
    assert.equal(resizeCount(), resizesBeforeCancel);
    assert.ok(Math.abs((await tree.boundingBox()).width - resizedExplorer) < 2);
    assert.equal(
      await inspector.getAttribute("data-expanded"),
      "true",
    );
    assert.equal(
      await page
        .getByRole("tab", { name: "Files", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-helper-textarea").pressSequentially("pwd");
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-helper-textarea").press("Enter");
    await page.waitForFunction(
      () => document.querySelector(".editor-terminal .xterm-screen") !== null,
    );
    await page.screenshot({
      path: "/tmp/citropy-editor-terminal.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Hide terminal dock", exact: true })
      .click();
    assert.equal(await dock.count(), 0);
    await page
      .getByRole("button", { name: "Open terminal", exact: true })
      .click();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    assert.ok(Math.abs((await dock.boundingBox()).height - resizedTerminal) < 2);
    assert.equal(
      terminalEvents.filter(
        (event) => event.t === "panel.open" && event.kind === "terminal",
      ).length,
      1,
    );
    assert.equal(
      terminalEvents.some((event) => event.t === "term.close"),
      false,
    );
    assert.equal(
      terminalEvents
        .filter((event) => event.t === "term.data")
        .map((event) => event.data)
        .join(""),
      "pwd\r",
    );
    await page.locator(".workbench-tabs").getByRole("tab", { name: "Terminal 1", exact: true }).click();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    assert.equal(await page.getByRole("tab", { name: "Files", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "Open panel", exact: true }).click();
    await page.getByRole("menuitem", { name: /Terminal/ }).click();
    await dock.getByRole("tab", { name: "Terminal 2", selected: true }).waitFor();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-helper-textarea").pressSequentially("second");
    assert.equal(await page.getByRole("tab", { name: "Files", exact: true }).getAttribute("aria-selected"), "true");
    const secondId = terminalEvents.findLast((event) => event.t === "panel.open").id;
    const secondData = () => terminalEvents.filter((event) => event.t === "term.data" && event.termId === secondId).map((event) => event.data).join("");
    for (let attempt = 0; attempt < 100 && secondData() !== "second"; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(secondData(), "second");
    await page.locator(".workbench-tabs").getByRole("tab", { name: "Terminal 1", exact: true }).click();
    await dock.getByRole("tab", { name: "Terminal 1", selected: true }).waitFor();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    await page.locator(".workbench-tabs").getByRole("tab", { name: "Terminal 1", exact: true }).press("ArrowRight");
    await dock.getByRole("tab", { name: "Terminal 2", selected: true }).waitFor();
    await page.locator(".workbench-tabs").getByRole("tab", { name: "Terminal 2", exact: true }).press("ArrowLeft");
    await dock.getByRole("tab", { name: "Terminal 1", selected: true }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "Files", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await inspector.getAttribute("data-expanded"), "true");
    assert.ok(Math.abs((await inspector.boundingBox()).width - (await page.locator(".shell-body").boundingBox()).width) < 1);
    assert.equal(await firstTerminal.evaluate(element => element.isConnected), true);
    await dock.getByRole("button", { name: "New terminal", exact: true }).click();
    await dock.getByRole("tab", { name: "Terminal 3", selected: true }).waitFor();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    assert.equal(await dock.getByRole("tab").count(), 3);
    await page.waitForFunction(() => {
      const highlight = document.querySelector('.editor-terminal-tabs .selection-highlight');
      const tab = document.querySelector('.editor-terminal-tab[data-active="true"]');
      return !highlight.hidden && Math.abs(highlight.getBoundingClientRect().x - tab.getBoundingClientRect().x) < 1;
    });
    await page.screenshot({ path: "/tmp/citropy-editor-terminal-tabs.png", animations: "disabled" });
    const workspaceTabs = page.getByRole("tablist", { name: "Open workspace panels" });
    const terminalTabs = dock.getByRole("tablist", { name: "Editor terminals" });
    const tabNames = (strip) => strip.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => tab.textContent.trim()));
    const terminalOpensBefore = terminalEvents.filter((event) => event.t === "term.open");
    await workspaceTabs.getByRole("tab", { name: "Terminal 1", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /Rename terminal/ }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename terminal" });
    const terminalName = renameDialog.getByRole("textbox", { name: "Name" });
    assert.equal(await terminalName.inputValue(), "Terminal 1");
    await terminalName.fill("   ");
    assert.equal(await renameDialog.getByRole("button", { name: "Save", exact: true }).isEnabled(), false);
    await terminalName.fill("  Dev server  ");
    await page.screenshot({ path: "/tmp/citropy-terminal-rename-desktop.png", animations: "disabled" });
    await terminalName.press("Enter");
    await terminalTabs.getByRole("tab", { name: "Dev server", exact: true }).waitFor();
    await workspaceTabs.getByRole("tab", { name: "Dev server", exact: true }).waitFor();
    assert.equal(await workspaceTabs.getByRole("tab", { name: "Files", selected: true }).count(), 1);
    assert.equal(await terminalTabs.getByRole("tab", { name: "Terminal 3", selected: true }).count(), 1);
    await workspaceTabs.getByRole("tab", { name: "Dev server", exact: true }).press("F2");
    await terminalName.fill("Discarded name");
    await terminalName.press("Escape");
    assert.equal(terminalEvents.filter((event) => event.t === "panel.rename").length, 1);
    assert.deepEqual(terminalEvents.filter((event) => event.t === "term.open"), terminalOpensBefore, "renaming should not reattach terminals");
    const dragTab = async (strip, name, target, edge, cancel = false) => {
      const source = await strip.getByRole("tab", { name, exact: true }).boundingBox();
      const destination = await strip.getByRole("tab", { name: target, exact: true }).boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(destination.x + (edge === "after" ? destination.width - 2 : 2), destination.y + destination.height / 2, { steps: 10 });
      await page.waitForFunction(() => document.querySelector('[data-dragging="true"]'));
      if (cancel) {
        await page.screenshot({ path: "/tmp/citropy-tab-drag-preview.png", animations: "disabled" });
        await page.keyboard.press("Escape");
      }
      await page.mouse.up();
      await settleTerminal();
    };
    await dragTab(workspaceTabs, "Files", "Terminal 2", "after");
    assert.deepEqual(await tabNames(workspaceTabs), ["Dev server", "Terminal 2", "Files", "Terminal 3"]);
    assert.equal(await workspaceTabs.getByRole("tab", { name: "Files", selected: true }).count(), 1);
    assert.equal(await terminalTabs.getByRole("tab", { name: "Terminal 3", selected: true }).count(), 1);
    const movesBeforeCancel = terminalEvents.filter((event) => event.t === "panel.move").length;
    assert.deepEqual(terminalEvents.filter((event) => event.t === "term.open"), terminalOpensBefore, "moving Files should not reattach terminals");
    await dragTab(workspaceTabs, "Files", "Dev server", "before", true);
    assert.deepEqual(await tabNames(workspaceTabs), ["Dev server", "Terminal 2", "Files", "Terminal 3"]);
    assert.equal(terminalEvents.filter((event) => event.t === "panel.move").length, movesBeforeCancel);
    assert.equal(await page.locator('[data-dragging="true"], .panel-drop-marker:not([hidden])').count(), 0);
    await workspaceTabs.getByRole("tab", { name: "Files", exact: true }).press("Alt+ArrowLeft");
    assert.deepEqual(await tabNames(workspaceTabs), ["Dev server", "Files", "Terminal 2", "Terminal 3"]);
    await workspaceTabs.getByRole("tab", { name: "Files", exact: true }).press("Shift+F10");
    await page.getByRole("menuitem", { name: /Move tab left/ }).click();
    await settleTerminal();
    assert.deepEqual(await tabNames(workspaceTabs), ["Files", "Dev server", "Terminal 2", "Terminal 3"]);
    assert.deepEqual(terminalEvents.filter((event) => event.t === "term.open"), terminalOpensBefore, "keyboard moves should not reattach terminals");
    await dragTab(terminalTabs, "Dev server", "Terminal 2", "after");
    assert.deepEqual(await tabNames(terminalTabs), ["Terminal 2", "Dev server", "Terminal 3"]);
    assert.equal(await terminalTabs.getByRole("tab", { name: "Terminal 3", selected: true }).count(), 1);
    await dragTab(terminalTabs, "Dev server", "Terminal 2", "before");
    assert.deepEqual(await tabNames(terminalTabs), ["Dev server", "Terminal 2", "Terminal 3"]);
    await dragTab(terminalTabs, "Terminal 3", "Dev server", "before");
    assert.deepEqual(await tabNames(terminalTabs), ["Terminal 3", "Dev server", "Terminal 2"]);
    assert.deepEqual(await tabNames(workspaceTabs), ["Files", "Terminal 3", "Dev server", "Terminal 2"]);
    assert.equal(await terminalTabs.getByRole("tab", { name: "Terminal 3", selected: true }).count(), 1);
    assert.deepEqual(terminalEvents.filter((event) => event.t === "term.open"), terminalOpensBefore);
    assert.equal(await firstTerminal.evaluate((element) => element.isConnected), true);
    assert.equal(await inspector.getAttribute("data-expanded"), "true");
    await terminalTabs.getByRole("tab", { name: "Terminal 3", exact: true }).press("Alt+ArrowRight");
    await terminalTabs.getByRole("tab", { name: "Terminal 3", exact: true }).press("Alt+ArrowRight");
    await page.waitForFunction(() => document.querySelector('.editor-terminal-tabs > [data-panel-id]:last-child [role="tab"]')?.textContent.trim() === "Terminal 3");
    assert.deepEqual(await tabNames(terminalTabs), ["Dev server", "Terminal 2", "Terminal 3"]);
    await terminalTabs.getByRole("tab", { name: "Dev server", exact: true }).dblclick();
    await terminalName.fill("Terminal 1");
    await terminalName.press("Enter");
    await terminalTabs.getByRole("tab", { name: "Terminal 1", exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/citropy-terminal-tabs-reordered.png", animations: "disabled" });
    await dock.getByRole("tab", { name: "Terminal 3", exact: true }).press("Home");
    await dock.getByRole("tab", { name: "Terminal 1", selected: true }).waitFor();
    await dock.getByRole("tab", { name: "Terminal 1", exact: true }).press("ArrowRight");
    await dock.getByRole("tab", { name: "Terminal 2", selected: true }).waitFor();
    await dock.getByRole("tab", { name: "Terminal 2", exact: true }).press("End");
    await dock.getByRole("tab", { name: "Terminal 3", selected: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 850 });
    await dock.getByRole("tab", { name: "Terminal 3", exact: true }).press("Home");
    await dock.getByRole("tab", { name: "Terminal 1", exact: true }).press("End");
    const selectedTerminal = await dock.getByRole("tab", { name: "Terminal 3", selected: true }).boundingBox();
    const stripBounds = await dock.getByRole("tablist").boundingBox();
    assert.ok(selectedTerminal.x >= stripBounds.x - 1 && selectedTerminal.x + selectedTerminal.width <= stripBounds.x + stripBounds.width + 1);
    await page.screenshot({ path: "/tmp/citropy-editor-terminal-tabs-narrow.png", animations: "disabled" });
    await terminalTabs.getByRole("tab", { name: "Terminal 3", exact: true }).press("Shift+F10");
    assert.equal(await page.getByRole("menuitem", { name: /Move tab right/ }).isEnabled(), false);
    await page.screenshot({ path: "/tmp/citropy-terminal-menu-narrow.png", animations: "disabled" });
    await page.getByRole("menuitem", { name: /Rename terminal/ }).click();
    await terminalName.fill("Terminal with a longer name");
    await page.screenshot({ path: "/tmp/citropy-terminal-rename-narrow.png", animations: "disabled" });
    await terminalName.press("Escape");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await dock.getByRole("button", { name: "Close Terminal 3", exact: true }).click();
    await dock.getByRole("tab", { name: "Terminal 2", selected: true }).waitFor();
    assert.equal(await dock.getByRole("tab").count(), 2);
    await dock.getByRole("button", { name: "Close Terminal 1", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".editor-terminal-tab").length === 1);
    assert.equal(await dock.getByRole("tab", { name: "Terminal 2", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await inspector.getAttribute("data-expanded"), "true");
    await page.screenshot({
      path: "/tmp/citropy-terminal-expanded.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Restore workspace", exact: true })
      .click();
    assert.equal(await inspector.getAttribute("data-expanded"), "false");
    assert.ok(Math.abs((await inspector.boundingBox()).width - wide.width) < 2);
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await page
      .getByRole("button", { name: "Expand workspace", exact: true })
      .click();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    assert.equal(
      await inspector.getAttribute("data-expanded"),
      "true",
    );
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForFunction(() => document.querySelector('[data-pane="explorer"]').getAttribute("aria-orientation") === "horizontal");
    const narrowTree = await tree.boundingBox();
    await explorerResize.press("ArrowUp");
    assert.ok((await tree.boundingBox()).height < narrowTree.height);
    await terminalResize.press("Home");
    assert.ok((await dock.boundingBox()).height >= 119);
    await explorerResize.press("End");
    const statusBounds = await page.locator(".editor-status").boundingBox();
    const documentBounds = await page.locator(".editor-document").boundingBox();
    assert.ok(statusBounds.y + statusBounds.height <= documentBounds.y + documentBounds.height + 1);
    assert.ok((await page.locator(".code-editor-surface").boundingBox()).height > 50);
    await explorerResize.press("Enter");
    await page.screenshot({
      path: "/tmp/citropy-editor-terminal-narrow.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.querySelector('[data-pane="explorer"]').getAttribute("aria-orientation") === "vertical");
    assert.ok(Math.abs((await tree.boundingBox()).width - resizedExplorer) < 2);
    await page.evaluate(async () => {
      const { setUiScale } = await import("/web/src/lib/store.ts");
      setUiScale(150);
    });
    await page.waitForFunction((size) => Math.abs(document.querySelector('.editor-explorer').getBoundingClientRect().width - size * 1.5) < 2, resizedExplorer);
    await terminalResize.press("End");
    const scaledStatus = await page.locator(".editor-status").boundingBox();
    const scaledDocument = await page.locator(".editor-document").boundingBox();
    assert.ok(scaledStatus.y + scaledStatus.height <= scaledDocument.y + scaledDocument.height + 1);
    await terminalResize.press("Enter");
    await page.evaluate(async () => {
      const { setUiScale } = await import("/web/src/lib/store.ts");
      setUiScale(100);
    });
    await page
      .getByRole("button", { name: "Hide terminal dock", exact: true })
      .click();
    const input = page.getByRole("textbox", { name: "Code editor: hello.ts" });
    await page.screenshot({ path: "/tmp/citropy-editor-initial.png" });
    await input.waitFor({ state: "attached" });
    await input.press("Control+End");
    await input.pressSequentially("export const answer = 42;");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".editor-status")
        ?.textContent?.startsWith("Saved"),
    );
    assert.match(text, /answer = 42/);
    assert.equal(writes, 1);
    await input.press("Control+End");
    await input.pressSequentially("\nexport const mediaDraft = true;");
    const draft = await page.evaluate(async () => {
      const { useDocuments } = await import("/web/src/components/editor/documents.ts");
      return useDocuments.getState().documents.find((document) => document.path === "hello.ts").model.getValue();
    });
    await tree.getByRole("button", { name: "diagram.png", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.media-preview img')?.naturalWidth > 0);
    assert.equal(await page.locator(".editor-tab").count(), 2);
    assert.equal(await page.getByRole("button", { name: "Find and replace", exact: true }).isDisabled(), true);
    await tree.getByRole("button", { name: "diagram.png", exact: true }).click();
    assert.equal(await page.locator(".editor-tab").count(), 2);
    await tree.getByRole("button", { name: "demo.webm", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.media-preview video')?.readyState >= 1);
    assert.equal(await page.locator(".editor-tab").count(), 3);
    await page.screenshot({ path: "/tmp/citropy-editor-media.png", animations: "disabled" });
    await page.locator(".editor-tab").getByRole("button", { name: /^hello\.ts/ }).click();
    await input.waitFor({ state: "attached" });
    assert.match(await page.locator(".view-lines").textContent(), /mediaDraft/);
    await input.press("Control+z");
    assert.notEqual(await page.evaluate(async () => {
      const { useDocuments } = await import("/web/src/components/editor/documents.ts");
      return useDocuments.getState().documents.find((document) => document.path === "hello.ts").model.getValue();
    }), draft);
    await input.press("Control+Shift+z");
    assert.equal(await page.evaluate(async () => {
      const { useDocuments } = await import("/web/src/components/editor/documents.ts");
      return useDocuments.getState().documents.find((document) => document.path === "hello.ts").model.getValue();
    }), draft);
    await input.press("Control+s");
    await page.waitForFunction(() => document.querySelector(".editor-status")?.textContent.startsWith("Saved"));
    await page.getByRole("button", { name: "Close demo.webm", exact: true }).click();
    await page.locator(".editor-tab").getByRole("button", { name: "diagram.png", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.media-preview img')?.naturalWidth > 0);
    await page.getByRole("button", { name: "Close diagram.png", exact: true }).click();
    await input.waitFor({ state: "attached" });
    const explorer = page.locator(".editor-explorer");
    assert.equal(await explorer.isVisible(), true);
    await page
      .getByRole("searchbox", { name: "Find a file", exact: true })
      .fill("settings");
    const toggleExplorer = page.getByRole("button", {
      name: "Toggle file explorer",
      exact: true,
    });
    await toggleExplorer.click();
    assert.equal(await explorer.isVisible(), false);
    await toggleExplorer.click();
    assert.equal(
      await page
        .getByRole("searchbox", { name: "Find a file", exact: true })
        .inputValue(),
      "settings",
    );
    await page
      .getByRole("searchbox", { name: "Find a file", exact: true })
      .fill("");
    assert.equal(
      await explorer
        .getByRole("button", { name: "src", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    await page
      .getByRole("searchbox", { name: "Find a file", exact: true })
      .fill("settings");
    await explorer
      .getByRole("button", { name: "settings.json", exact: true })
      .click();
    assert.equal(await explorer.isVisible(), true);
    await page
      .getByRole("textbox", { name: "Code editor: settings.json" })
      .waitFor({ state: "attached" });
    await page
      .locator(".editor-tab")
      .getByRole("button", { name: "hello.ts", exact: true })
      .click();
    await input.press("Control+End");
    await input.pressSequentially("\nexport const draft = true;");
    await page
      .getByRole("button", { name: "Close hello.ts", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    conflict = true;
    await input.press("Control+s");
    await page
      .getByRole("alert")
      .filter({ hasText: "changed on disk" })
      .waitFor();
    assert.match(
      await page.locator(".editor-status").textContent(),
      /Unsaved changes/,
    );
    await page
      .getByRole("button", { name: "Find and replace", exact: true })
      .click();
    await page.locator(".find-widget.visible").waitFor();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "/tmp/citropy-editor-desktop.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForFunction(() => {
      const tree = document
        .querySelector(".editor-explorer")
        .getBoundingClientRect();
      const editor = document
        .querySelector(".editor-main")
        .getBoundingClientRect();
      return tree.bottom <= editor.top + 1 && editor.height > 200;
    });
    await page.screenshot({ path: "/tmp/citropy-editor-narrow.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page
      .getByRole("button", { name: "Close settings.json", exact: true })
      .click();
    await input.press("Control+End");
    await input.pressSequentially('\nconst broken: number = "wrong";');
    await page.waitForFunction(() =>
      /[1-9][0-9]* problems/.test(
        document.querySelector(".editor-status")?.textContent ?? "",
      ),
    );
    await page.evaluate(async () => {
      const { setTheme } = await import("/web/src/lib/store.ts");
      setTheme("dark");
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "/tmp/citropy-editor-dark.png",
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Open terminal", exact: true }).click();
    await dock.locator(".editor-terminal-body:not([hidden]) .xterm-screen").waitFor();
    await page.screenshot({ path: "/tmp/citropy-editor-dark-terminal.png", animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForFunction(() => {
      const screen = document.querySelector('.editor-terminal-body:not([hidden]) .xterm-screen');
      return screen && screen.getBoundingClientRect().width < 390;
    });
    await page.screenshot({ path: "/tmp/citropy-editor-dark-terminal-narrow.png", animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Hide terminal dock", exact: true }).click();
    await page
      .getByRole("button", { name: "Reload file", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".editor-status")
        ?.textContent?.startsWith("Saved"),
    );
    await toggleExplorer.click();
    assert.equal(await explorer.isVisible(), false);
    await page
      .getByRole("button", { name: "Close hello.ts", exact: true })
      .click();
    assert.equal(await explorer.isVisible(), true);
    await page.getByText("Your code, right here", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Browse files", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "New file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "New file path", exact: true })
      .fill("scratch.ts");
    await page
      .getByRole("button", { name: "Create file", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Code editor: scratch.ts", exact: true })
      .waitFor({ state: "attached" });
    assert.equal(await explorer.isVisible(), true);
    const acknowledgements = terminalEvents.filter(
      (event) => event.t === "term.ack",
    );
    assert.ok(acknowledgements.length >= 3);
    assert.equal(
      new Set(acknowledgements.map((event) => event.streamId)).size,
      acknowledgements.length,
    );
    assert.deepEqual(errors, []);
  },
);
