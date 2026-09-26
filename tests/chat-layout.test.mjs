import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

test("chat content and controls adapt when the workspace squeezes the conversation", { timeout: 180_000 }, async (t) => {
  const cache = await mkdtemp(join(tmpdir(), "citropy-chat-layout-"));
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL("..", import.meta.url)),
    cacheDir: cache, plugins: [react()], logLevel: "error",
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await server.close();
    await rm(cache, { recursive: true, force: true });
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({ project: "project", thread: "chat", inspector: "1", sidebar: "1", theme: "dark", uiScale: "100" }))
      localStorage.setItem(`citropy.${key}`, value);
  });
  const thread = {
    id: "chat", projectId: "project", title: "Narrow conversation", provider: "opencode", model: "sample",
    permissionMode: "bypass", effort: "xhigh", status: "working", running: true,
    runStartedAt: Date.now() - 133000, createdAt: 1, updatedAt: 1,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0, contextMax: 1050000 },
  };
  const messages = [
    { id: "question", role: "user", ts: 1, parts: [{ id: "question-text", kind: "text", text: "What effect do I look for?", complete: true }] },
    { id: "answer", role: "assistant", model: "sample", ts: 2, parts: [{ id: "answer-text", kind: "text", text: "The desktop contains a hidden `.directory` file and an empty `Test` folder.", complete: true }] },
    { id: "working", role: "assistant", model: "sample", ts: Date.now(), parts: Array.from({ length: 15 }, (_, index) => ({
      id: `tool-${index}`, callId: `call-${index}`, kind: "tool", name: "websearch", shape: "search",
      headline: "Searching for the requested desktop effect", input: { query: "desktop effect" },
      status: index < 3 ? "error" : index === 14 ? "running" : "ok", startedAt: Date.now() - 10000, output: "Search results",
    })) },
  ];
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.routeWebSocket("**/socket", socket => {
    socket.onMessage(raw => {
      if (JSON.parse(raw).t === "thread.load") socket.send(JSON.stringify({ t: "thread.messages", threadId: "chat", messages }));
    });
    socket.send(JSON.stringify({ t: "hello", snapshot: {
      projects: [{ id: "project", name: "Desktop", path: "/example", isGit: false, lastOpened: 1 }],
      threads: [thread], providers: [{ id: "opencode", label: "OpenCode", available: true, enabled: true, models: [{
        id: "sample", label: "Muse Spark 1.3 Free", efforts: ["low", "high", "xhigh"], defaultEffort: "xhigh", contextMax: 1050000,
      }] }], permissions: [], home: "/example", panels: [{ id: "changes", kind: "changes", projectId: "project", title: "Changes" }],
    } }));
  });
  await page.goto(server.resolvedUrls.local[0], { timeout: 120_000 });
  await page.locator("#message-working .activity-head").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const { useApp } = await import("/web/src/lib/store.ts");
    useApp.setState(state => ({
      showGitHubIdentity: true,
      githubAccount: { login: "TinuxWithAnExceptionallyLongAccountName", avatar_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30'%3E%3Crect width='30' height='30' fill='%237a9'/%3E%3C/svg%3E", html_url: "https://example.invalid" },
      providers: state.providers.map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model, label: "Muse Spark Extended Thinking Preview" })) })),
    }));
  });
  const draft = page.locator(".composer-input");
  await page.bringToFront();
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-window-blurred"));
  await page.getByRole('button', { name: 'Open panel', exact: true }).focus();
  await page.waitForTimeout(380);
  await draft.focus();
  await page.waitForFunction(() => document.querySelector('.composer-focus-ring').getAnimations({ subtree: true }).some(animation =>
    animation.animationName === 'composer-trace' && animation.playState === 'running',
  ));
  const ring = page.locator('.composer-focus-ring');
  const trace = await ring.evaluate(async node => {
    const animation = node.getAnimations({ subtree: true }).find(animation => animation.animationName === 'composer-trace');
    const before = getComputedStyle(node, '::before').transform;
    await new Promise(resolve => setTimeout(resolve, 120));
    return { before, after: getComputedStyle(node, '::before').transform, duration: animation.effect.getTiming().duration, iterations: animation.effect.getTiming().iterations };
  });
  assert.notEqual(trace.before, trace.after);
  assert.equal(trace.duration, 6000);
  assert.equal(trace.iterations, Infinity);
  await page.getByRole('button', { name: 'Open panel', exact: true }).focus();
  assert.equal(await ring.evaluate(node => getComputedStyle(node, '::before').animationPlayState), 'paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await draft.focus();
  assert.equal(await ring.evaluate(node => getComputedStyle(node, '::before').display), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await draft.fill("Keep this draft while resizing.");

  const resizeChat = width => page.evaluate(async width => {
    const { useApp, viewportWidth } = await import("/web/src/lib/store.ts");
    const strip = parseFloat(getComputedStyle(document.querySelector(".shell")).paddingLeft) / (useApp.getState().uiScale / 100);
    useApp.setState({ panelWidths: { inspector: viewportWidth() - strip - 252 - width } });
  }, width);
  await resizeChat(760);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.headerGlides = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.matches?.('.turn-heading > .turn-meta') && Array.isArray(keyframes) && keyframes.some(frame => frame.translate)) window.headerGlides += 1;
      return animate.call(this, keyframes, options);
    };
  });
  for (const width of [520, 760, 520]) {
    const glides = await page.evaluate(() => window.headerGlides);
    await resizeChat(width);
    await page.waitForFunction(count => window.headerGlides > count, glides);
    await page.screenshot({ path: `/tmp/citropy-header-moving-${width}.png` });
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.turn-heading > .turn-meta')].every(node =>
    node.getAnimations().every(animation => animation.playState !== 'running'),
  ));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await resizeChat(760);
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#message-answer .turn-heading .turn-meta').evaluate(node => node.getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.translate))), false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await resizeChat(590);
  await page.waitForFunction(() => {
    const animation = document.querySelector('#message-answer .turn-heading .turn-meta').getAnimations().find(animation =>
      animation.playState === 'running' && animation.effect.getKeyframes().some(frame => frame.translate),
    );
    if (!animation) return false;
    window.headerResizeAnimation = animation;
    return true;
  });
  for (const width of [580, 570, 560]) {
    await resizeChat(width);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.notEqual(await page.evaluate(() => window.headerResizeAnimation.playState), 'idle', 'Dragging within the same header layout must not cancel its slide');
  }

  for (const language of ["en", "es"]) {
    for (const scale of [100, 150]) {
      for (const width of [760, 520, 420, 360]) {
        const targetWidth = await page.evaluate(async ({ language, scale, width }) => {
          const { setLanguage, setUiScale, useApp, viewportWidth } = await import("/web/src/lib/store.ts");
          setLanguage(language);
          setUiScale(scale);
          const target = Math.min(width, viewportWidth() - 48 - 252 - 260);
          useApp.setState({ panelWidths: { inspector: viewportWidth() - 48 - 252 - target } });
          return target;
        }, { language, scale, width });
        await page.waitForTimeout(200);
        const layout = await page.evaluate(() => {
          const stage = document.querySelector(".stage").getBoundingClientRect();
          const head = document.querySelector("#message-working .activity-head");
          const composer = document.querySelector(".composer-shell").getBoundingClientRect();
          return {
            width: stage.width,
            head: { width: head.clientWidth, scroll: head.scrollWidth },
            action: head.querySelector(".activity-action").getBoundingClientRect().toJSON(),
            count: head.querySelector(".reason-count").getBoundingClientRect().toJSON(),
            chevron: head.querySelector(".group-chevron").getBoundingClientRect().toJSON(),
            stage: stage.toJSON(), composer: composer.toJSON(),
            buttons: [...document.querySelectorAll(".composer-bar button")].map(node => node.getBoundingClientRect().toJSON()),
          };
        });
        assert.ok(Math.abs(layout.width / (scale / 100) - targetWidth) < 1, JSON.stringify(layout));
        assert.ok(layout.head.scroll <= layout.head.width + 1, JSON.stringify({ language, scale, width, layout }));
        assert.ok(layout.action.left >= layout.stage.left && layout.action.right <= layout.stage.right, JSON.stringify(layout));
        if (width >= 600) assert.ok(Math.abs(layout.count.top + layout.count.height / 2 - layout.chevron.top - layout.chevron.height / 2) < 1, JSON.stringify(layout));
        assert.ok(layout.buttons.length >= 5, JSON.stringify(layout.buttons.length));
        for (const button of layout.buttons)
          assert.ok(button.width > 0 && button.left >= layout.composer.left && button.right <= layout.composer.right, JSON.stringify(layout));
        assert.equal(await draft.inputValue(), "Keep this draft while resizing.");
        if (width <= 600) {
          await page.waitForFunction(() => [...document.querySelectorAll('.turn-heading, .turn-heading *, .message-avatar')].every(node => node.getAnimations().every(animation => animation.playState !== 'running')));
          const headers = await page.locator('.turn:has(.turn-heading)').evaluateAll(turns => turns.map(turn => {
            const heading = turn.querySelector('.turn-heading');
            const name = heading.querySelector('strong');
            return {
              nameWidth: name.clientWidth, nameScroll: name.scrollWidth,
              name: name.getBoundingClientRect().toJSON(),
              avatar: turn.querySelector('.message-avatar').getBoundingClientRect().toJSON(),
              heading: heading.getBoundingClientRect().toJSON(),
              metadata: [...heading.querySelectorAll('time')].map(node => node.getBoundingClientRect().toJSON()),
            };
          }));
          for (const header of headers) {
            assert.ok(header.nameWidth >= header.nameScroll - 1, JSON.stringify({ width, scale, header }));
            assert.ok(header.avatar.left >= layout.stage.left && header.avatar.right <= layout.stage.right, JSON.stringify(header));
            assert.ok(header.name.right <= header.avatar.left || header.name.left >= header.avatar.right, JSON.stringify(header));
            assert.ok(header.metadata.every(meta => meta.top >= header.name.bottom - 1), JSON.stringify(header));
          }
        }
        if (scale === 100) await page.screenshot({ path: `/tmp/citropy-chat-layout-${language}-${width}.png`, animations: "disabled" });
      }
    }
  }
  const details = page.locator("#message-working .activity-head");
  await details.click();
  assert.equal(await details.getAttribute("aria-expanded"), "true");
  await details.click();
  await page.locator('#message-working .activity-head[aria-expanded="false"]').waitFor();
  assert.equal(await details.getAttribute("aria-expanded"), "false");
  await page.evaluate(async () => {
    const { setLanguage, setUiScale } = await import("/web/src/lib/store.ts");
    setLanguage("en");
    setUiScale(100);
  });
  await page.getByRole("button", { name: "Open panel", exact: true }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  assert.equal(await menu.evaluate(node => getComputedStyle(node).boxShadow), "none");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  assert.ok(await page.locator("#message-working .group-failed").count() > 0);
  await page.evaluate(async () => {
    const { setShowFailedTools } = await import("/web/src/lib/store.ts");
    setShowFailedTools(false);
  });
  await page.waitForFunction(() => !document.querySelector("#message-working .group-failed"));
  await details.click();
  const group = page.locator(".group-head").first();
  if (await group.count()) await group.click();
  await page.locator(".tool-head").first().click();
  await page.getByText("Search results", { exact: true }).first().waitFor();
  assert.equal(await page.locator(".group-failed").count(), 0);
  assert.equal(await page.evaluate(async () => {
    const { useApp } = await import("/web/src/lib/store.ts");
    return Object.values(useApp.getState().parts).filter(part => part.kind === "tool" && part.status === "error").length;
  }), 3);
  assert.equal(await page.evaluate(() => localStorage.getItem("citropy.showFailedTools")), "0");
  await page.reload();
  await page.locator("#message-working .activity-head").waitFor();
  assert.equal(await page.locator("#message-working .group-failed").count(), 0);
  await page.evaluate(async () => {
    const { setShowFailedTools } = await import("/web/src/lib/store.ts");
    setShowFailedTools(true);
  });
  await page.locator("#message-working .group-failed").first().waitFor();
  assert.deepEqual(errors, []);
});
