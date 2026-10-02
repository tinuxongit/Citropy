import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("review retrieval and rendering", { timeout: 120_000 }, async t => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-review-tests`, plugins: [react()], logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null } });
  await server.listen();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  let sequence = 0;
  async function fixture(t, body, width = 1280, routes) {
    const context = await browser.newContext({ viewport: { width, height: 860 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
    await routes?.(page);
    const path = `/review-fixture-${++sequence}.html`;
    const html = await server.transformIndexHtml(path, `<!doctype html><html data-theme="neutral" data-scheme="dark"><body style="margin:0;background:#1e1e1e"><div id="fixture" class="scroll" style="position:absolute;inset:20px;overflow:auto"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { useApp } from '/web/src/lib/store.ts';
      import '/web/src/styles/tokens.css';
      import '/web/src/styles/base.css';
      import '/web/src/styles/overlays.css';
      import '/web/src/styles/features.css';
      import '/web/src/styles/github.css';
      import '/web/src/styles/diff.css';
      import '/web/src/styles/virtual-list.css';
      useApp.setState({ connected: true, assistance: { reviewModel: null } });
      ${body}
    </script></body></html>`);
    await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    return page;
  }

  for (const width of [1280, 380]) await t.test(`large GitHub diffs keep bounded file and line controls at ${width}px`, async t => {
    const page = await fixture(t, `
      import { GitHubItemDetail } from '/web/src/components/github/GitHubItemDetail.tsx';
      const patch = '@@ -1 +1,6000 @@\\n-old\\n' + Array.from({ length: 6000 }, (_, index) => '+line ' + index + '\\n').join('');
      const files = Array.from({ length: 120 }, (_, index) => ({ filename: 'file-' + index + '.txt', additions: 6000, deletions: 1, status: 'modified', patch, blob_url: 'https://github.com/example/repo/blob/main/file-' + index + '.txt' }));
      const item = { number: 1, title: 'Large review', state: 'closed', user: { login: 'reviewer' }, created_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/example/repo/pull/1' };
      createRoot(document.querySelector('#fixture')).render(React.createElement(GitHubItemDetail, { repository: { permissions: {} }, pull: true, currentUser: 'reviewer', detail: { item, files, comments: [], reviews: [], checks: [], statuses: [] }, tab: 'Files changed', onTab: () => {}, onAction: () => {} }));
    `, width);
    await page.getByRole("region", { name: "Diff for file-0.txt", exact: true }).waitFor();
    assert.ok(await page.locator(".github-files details").count() < 20);
    assert.ok(await page.locator(".diff-line").count() < 500);
    const diff = page.getByRole("region", { name: "Diff for file-0.txt", exact: true });
    await diff.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await diff.getByText("line 5999", { exact: true }).waitFor();
    assert.equal(await page.getByText("Diff truncated", { exact: true }).count(), 0);
    await page.locator(".github-files summary").filter({ hasText: "file-0.txt" }).click();
    await page.waitForFunction(() => !document.querySelector('.github-files details').open);
    await page.locator("#fixture").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.locator(".github-files summary").filter({ hasText: "file-119.txt" }).waitFor();
    await page.locator("#fixture").evaluate(element => { element.scrollTop = 0; });
    await page.locator(".github-files summary").filter({ hasText: "file-0.txt" }).waitFor();
    assert.equal(await page.locator(".github-files details").first().getAttribute("open"), null);
    await page.screenshot({ path: `/tmp/citropy-review-github-${width}.png` });
  });

  for (const width of [1280, 380]) await t.test(`local review loads only expanded files and ignores late scope responses at ${width}px`, async t => {
    const requests = [];
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    const revisions = { lastTurn: "a".repeat(64), staged: "b".repeat(64) };
    const page = await fixture(t, `
      import { TaskReview } from '/web/src/components/TaskReview.tsx';
      const thread = { id: 'review', projectId: 'project', provider: 'claude' };
      useApp.setState({ threads: { review: thread } });
      createRoot(document.querySelector('#fixture')).render(React.createElement(TaskReview, { thread, onClose: () => {} }));
    `, width, async page => {
      await page.route("**/api/threads/review?*", async route => {
        const params = new URL(route.request().url()).searchParams;
        const scope = params.get("scope");
        const path = params.get("path");
        requests.push({ scope, path, revision: params.get("revision"), summary: params.get("summary") });
        if (!path) return route.fulfill({ json: { scope, revision: revisions[scope], files: [{ path: `${scope}-first.txt`, added: 1, removed: 1 }, { path: `${scope}-second.txt`, added: 1, removed: 1 }] } });
        if (path === "lastTurn-second.txt") await delayed;
        await route.fulfill({ json: { path, added: 1, removed: 1, hunks: [{ header: "", oldStart: 1, newStart: 1, lines: [{ type: "del", oldNo: 1, text: "before" }, { type: "add", newNo: 1, text: path }] }] } }).catch(() => {});
      });
    });
    await page.getByRole("region", { name: "Diff for lastTurn-first.txt" }).waitFor();
    assert.deepEqual(requests.map(request => request.path), [null, "lastTurn-first.txt"]);
    assert.equal(requests[0].summary, "1");
    assert.equal(requests[1].revision, revisions.lastTurn);
    await page.getByRole("button", { name: "lastTurn-second.txt" }).click();
    await page.waitForFunction(() => document.querySelectorAll('.review-files [role="status"]').length === 1);
    await page.getByRole("button", { name: "Review scope", exact: true }).click();
    await page.getByRole("menuitem", { name: "Staged", exact: true }).click();
    await page.getByRole("region", { name: "Diff for staged-first.txt" }).waitFor();
    release();
    await page.waitForTimeout(50);
    assert.equal(await page.getByRole("region", { name: "Diff for lastTurn-second.txt" }).count(), 0);
    assert.equal(requests.filter(request => request.scope === "staged" && request.path).length, 1);
    await page.getByRole("button", { name: "staged-second.txt" }).click();
    await page.getByRole("region", { name: "Diff for staged-second.txt" }).waitFor();
    assert.equal(requests.at(-1).revision, revisions.staged);
    await page.screenshot({ path: `/tmp/citropy-review-task-${width}.png` });
  });
});
