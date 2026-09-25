import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("large workspace lists preserve state and navigation with bounded rendered rows", { timeout: 120000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-virtual-lists-"));
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [react()], cacheDir: directory, logLevel: "error",
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const skills = Array.from({ length: 600 }, (_, index) => ({
    id: `skill-${index}`, name: `Skill ${index}`, description: "Review workspace changes. ".repeat(index % 5 + 1),
    path: `/skills/skill-${index}/SKILL.md`, provider: "claude", scope: "personal", enabled: true,
  }));
  const reads = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/skills") {
      if (url.searchParams.has("id")) return route.fulfill({ json: { content: "# Instructions\n\n" + "Read this skill carefully.\n\n".repeat(25) } });
      if (route.request().method() === "PATCH") {
        const { id, action } = route.request().postDataJSON();
        const skill = skills.find((skill) => skill.id === id);
        if (action === "delete") skills.splice(skills.indexOf(skill), 1);
        else skill.enabled = action === "enable";
      }
      return route.fulfill({ json: skills });
    }
    if (url.pathname === "/api/editor/search")
      return route.fulfill({ json: Array.from({ length: 600 }, (_, index) => ({ path: `result-${index}.ts`, dir: false })) });
    if (url.pathname === "/api/editor/tree") {
      const path = url.searchParams.get("path");
      reads.push(path);
      if (path === "src") return route.fulfill({ json: [{ path: "src/nested", name: "nested", dir: true }, ...Array.from({ length: 600 }, (_, index) => ({ path: `src/file-${index}.ts`, name: `file-${index}.ts`, dir: false }))] });
      if (path === "src/nested") return route.fulfill({ json: [{ path: "src/nested/inside.ts", name: "inside.ts", dir: false }] });
      return route.fulfill({ json: [{ path: "src", name: "src", dir: true }] });
    }
    return route.fulfill({ json: {} });
  });
  const html = await server.transformIndexHtml("/lists.html", `<!doctype html><html data-theme="dark"><body><div id="fixture"></div><script type="module">
    import React, { StrictMode } from 'react';
    import { createRoot } from 'react-dom/client';
    import { useApp } from '/web/src/lib/store.ts';
    import { setUiScale } from '/web/src/lib/preferences.ts';
    import { FileExplorer } from '/web/src/components/editor/FileExplorer.tsx';
    import { SkillsSettings } from '/web/src/components/SkillsSettings.tsx';
    import { ToolsPane } from '/web/src/components/ToolsPane.tsx';
    import { SubagentsPane } from '/web/src/components/SubagentsPane.tsx';
    import { FileGroup } from '/web/src/components/git/FileGroup.tsx';
    import { Menu } from '/web/src/components/Menu.tsx';
    import { RemoteFolderDialog } from '/web/src/components/RemoteFolderDialog.tsx';
    import { useRemoteFolderRequest } from '/web/src/lib/remote-folder.ts';
    ${["tokens", "base", "app", "settings", "features", "inspector", "workbench", "editor", "git", "overlays", "markdown", "virtual-list"].map((name) => `import '/web/src/styles/${name}.css';`).join("\n")}
    const h = React.createElement;
    const root = createRoot(document.getElementById('fixture'));
    const tools = Array.from({ length: 600 }, (_, i) => ({ name: 'tool_' + i, description: 'Tool description ' + i }));
    const children = Array.from({ length: 600 }, (_, i) => ({ id: 'child-' + i, title: 'Child ' + i, parentThreadId: 'parent', parentMessageId: i < 500 ? 'earlier' : 'latest', provider: 'claude', model: 'fixture', createdAt: i, status: 'idle', running: false }));
    useApp.setState({ connected: true, uiScale: 100, activeProjectId: 'project', activeThreadId: 'parent', projects: [{ id: 'project', name: 'Project' }], tools, threads: Object.fromEntries(children.map(child => [child.id, child])) });
    window.citropyDesktop = { listWorkspaceFolder: async (_, path) => ({ path, parent: '/', folders: path === '/' ? Array.from({ length: 600 }, (_, i) => ({ name: 'folder-' + i, hidden: false })) : [{ name: 'child', hidden: false }] }) };
    window.opened = [];
    window.setScale = setUiScale;
    window.addSubagents = () => useApp.setState(state => ({ threads: {
      ...state.threads,
      ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => {
        const child = { ...children[599], id: 'new-' + i, createdAt: 600 + i, title: 'New child ' + i };
        return [child.id, child];
      })),
    } }));
    window.show = (view) => {
      let component;
      if (view === 'files') component = h(FileExplorer, { projectId: 'project', onOpen: path => window.opened.push(path) });
      if (view === 'skills') component = h(SkillsSettings);
      if (view === 'tools') component = h(ToolsPane);
      if (view === 'subagents') component = h(SubagentsPane);
      if (view === 'git') component = h(FileGroup, { title: 'Unstaged changes', list: Array.from({ length: 600 }, (_, i) => ({ path: 'src/change-' + i + '.ts', work: 'M', index: ' ', staged: false, untracked: false })), inIndex: false, disabled: false, selection: null, t: text => text, match: () => true, act: async (_, path) => { window.opened.push(path); return true; }, setSelection: selection => window.opened.push(selection.path) });
      if (view === 'menu') component = h(Menu, { trigger: ({ id, toggle }) => h('button', { id, onClick: toggle }, 'Show menu'), items: tools.map(tool => ({ id: tool.name, label: tool.name, hint: tool.description, onSelect: () => window.opened.push(tool.name) })) });
      if (view === 'remote') {
        useRemoteFolderRequest.setState({ request: { environmentId: 'remote', host: 'host', path: '/', resolve: value => window.opened.push(value) } });
        component = h(RemoteFolderDialog);
      }
      root.render(h(StrictMode, null, h('div', { key: view, className: view === 'files' ? 'editor-explorer' : view === 'skills' ? 'settings scroll' : view === 'git' ? 'scroll' : '', style: { height: '100vh', width: '100%', padding: view === 'git' ? 20 : undefined } }, component)));
    };
  </script></body></html>`);
  await page.route("**/lists.html", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(`${server.resolvedUrls.local[0]}lists.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.show));
  const show = (view) => page.evaluate((view) => window.show(view), view);
  const scroll = async (selector, bottom) => {
    await page.locator(selector).evaluate((element, bottom) => { element.scrollTop = bottom ? element.scrollHeight : 0; }, bottom);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const bounded = async (selector) => {
    const count = await page.locator(selector).count();
    assert.ok(count > 0 && count < 80, `${selector}: rendered ${count} of 600 rows`);
    return count;
  };

  await show("files");
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "nested", exact: true }).waitFor();
  assert.equal(await page.locator(":focus").getAttribute("title"), "src");
  await page.getByRole("button", { name: "nested", exact: true }).click();
  await page.getByRole("button", { name: "inside.ts", exact: true }).click();
  const fileRows = await bounded(".tree-row");
  await scroll(".tree", true);
  await page.getByRole("button", { name: "file-599.ts", exact: true }).click();
  await bounded(".tree-row");
  await scroll(".tree", false);
  await page.getByRole("button", { name: "inside.ts", exact: true }).waitFor();
  assert.equal(reads.filter((path) => path === "src").length, 1);
  const input = page.getByRole("searchbox", { name: "Find a file" });
  await input.fill("result");
  await page.getByRole("button", { name: "result-0.ts", exact: true }).waitFor();
  await bounded(".tree-row");
  await scroll(".tree", true);
  await page.getByRole("button", { name: "result-599.ts", exact: true }).click();
  await input.fill("");
  await page.getByRole("button", { name: "inside.ts", exact: true }).waitFor();
  await page.getByRole("button", { name: "file-0.ts", exact: true }).focus();
  for (let index = 1; index <= 50; index++) {
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("title"), `src/file-${index}.ts`);
  }
  await page.screenshot({ path: "/tmp/citropy-virtual-files.png" });
  await page.setViewportSize({ width: 390, height: 900 });
  await scroll(".tree", false);
  await page.getByRole("button", { name: "src", exact: true }).click();
  assert.equal(await page.locator(".tree-row").count(), 1);
  assert.equal(await page.locator(":focus").getAttribute("title"), "src");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "inside.ts", exact: true }).waitFor();
  await bounded(".tree-row");
  assert.equal(reads.filter((path) => path === "src").length, 1);
  await page.screenshot({ path: "/tmp/citropy-virtual-files-narrow.png" });
  await page.locator('.editor-explorer').evaluate(element => { element.style.display = 'none'; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await page.locator('.tree-row').count() < 80);
  await page.locator('.editor-explorer').evaluate(element => { element.style.display = ''; });
  await page.getByRole("button", { name: "inside.ts", exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });

  await show("skills");
  await page.getByRole("button", { name: /^Skill 0 / }).click();
  await page.getByRole("heading", { name: "Instructions" }).waitFor();
  const skillRows = await bounded(".skill-row");
  await scroll(".settings", true);
  await page.getByRole("switch", { name: "Enable Skill 599 for claude", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Enable Skill 599 for claude"]')?.checked === false);
  assert.equal(await page.getByRole("heading", { name: "Instructions" }).count(), 0);
  await scroll(".settings", false);
  await page.getByRole("heading", { name: "Instructions" }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(scale => window.setScale(scale), width === 390 ? 150 : 100);
    await bounded(".skill-row");
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('.skill-list > .virtual-list-row')];
      return rows.every((row, index) => !index || row.getBoundingClientRect().top >= rows[index - 1].getBoundingClientRect().bottom);
    });
    const bounds = await page.locator(".skill-row").first().boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    await page.screenshot({ path: `/tmp/citropy-virtual-skills-${width}.png` });
  }
  await page.getByRole("textbox", { name: "Search skills" }).fill("Skill 599");
  await page.waitForFunction(() => document.querySelectorAll('.skill-row').length === 1);
  assert.equal(await page.getByRole("switch").isChecked(), false);
  await page.getByRole("textbox", { name: "Search skills" }).fill("not installed");
  await page.getByText("No matching skills.", { exact: true }).waitFor();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.setScale(100));
  await show("tools");
  await page.locator("summary").filter({ hasText: /^tool 0$/ }).click();
  await page.getByRole("textbox", { name: "Find a tool" }).focus();
  await scroll(".tools-pane", true);
  await page.locator("summary").filter({ hasText: /^tool 599$/ }).waitFor();
  await bounded(".tool-definition");
  assert.equal(await page.locator("summary").filter({ hasText: /^tool 0$/ }).count(), 0);
  await scroll(".tools-pane", false);
  assert.equal(await page.locator(".tool-definition").first().getAttribute("open"), "");

  await show("subagents");
  await page.getByText("Child 500", { exact: true }).waitFor();
  await bounded(".subagent-item");
  await scroll(".subagents-pane", true);
  await page.getByRole("button", { name: /Earlier subagents/ }).click();
  await page.waitForFunction(() => {
    const history = document.querySelector('.subagent-history-list');
    return history && Math.abs(history.offsetHeight - history.querySelector('.virtual-list').offsetHeight) < 1;
  });
  await scroll(".subagents-pane", true);
  await page.getByText("Child 499", { exact: true }).waitFor();
  await bounded(".subagent-item");
  await page.evaluate(() => window.addSubagents());
  await page.getByRole("button", { name: /Earlier subagents/ }).scrollIntoViewIfNeeded();
  await page.getByText("Child 0", { exact: true }).waitFor();

  await show("git");
  await page.getByRole("button", { name: /change-0.ts/ }).first().waitFor();
  await bounded(".git-file-row");
  await scroll("#fixture > .scroll", true);
  await page.getByRole("button", { name: /change-99.ts/ }).first().click();

  await show("remote");
  await page.locator(".remote-folder-row").filter({ hasText: /^folder-0$/ }).waitFor();
  await bounded(".remote-folder-row");
  await scroll(".remote-folder-list", true);
  await page.locator(".remote-folder-row").filter({ hasText: /^folder-599$/ }).click();
  await page.locator(".remote-folder-row").filter({ hasText: /^child$/ }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await show("menu");
  await page.getByRole("button", { name: "Show menu" }).click();
  await page.keyboard.press("End");
  assert.match(await page.locator(":focus").textContent(), /tool_599/);
  assert.equal(await page.locator(".menu-option").last().evaluate(element => getComputedStyle(element).contentVisibility), "auto");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => window.opened.at(-1)), "tool_599");
  assert.deepEqual(errors, []);
  t.diagnostic(`600 items: ${fileRows} file rows and ${skillRows} skill cards mounted near the top.`);
});
