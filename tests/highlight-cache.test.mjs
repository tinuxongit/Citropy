import assert from "node:assert/strict";
import { test } from "node:test";

let sequence = 0;

async function fixture(t) {
  const originalWorker = globalThis.Worker;
  let worker;
  class HighlightWorker {
    requests = [];
    cancellations = [];
    terminated = false;
    constructor() { worker = this; }
    postMessage(request) {
      if ("cancel" in request) this.cancellations.push(request.cancel);
      else this.requests.push(request);
    }
    terminate() { this.terminated = true; }
    finish(result) {
      const request = this.requests.shift();
      assert.ok(request);
      this.onmessage({ data: { id: request.id, result } });
    }
  }
  globalThis.Worker = HighlightWorker;
  t.after(() => {
    worker?.onerror();
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  });
  const api = await import(`../web/src/lib/highlight.ts?fixture=${++sequence}`);
  return { ...api, get worker() { return worker; } };
}

test("concurrent identical highlights do not corrupt cache eviction accounting", async (t) => {
  const fixtureState = await fixture(t);
  const { highlight } = fixtureState;
  const small = "s".repeat(300_000);
  const duplicates = Array.from({ length: 3 }, () => highlight("small", "typescript", "dark"));
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish(small);
  assert.deepEqual(await Promise.all(duplicates), [small, small, small]);
  const large = "l".repeat(700_000);
  const next = highlight("large", "typescript", "dark");
  fixtureState.worker.finish(large);
  assert.equal(await next, large);
  assert.equal(await highlight("large", "typescript", "dark"), large);
  assert.equal(fixtureState.worker.requests.length, 0);
  const last = highlight("last", "typescript", "dark");
  fixtureState.worker.finish("last result");
  assert.equal(await last, "last result");
});

test("token results avoid repeated worker transfers without sharing mutable arrays", async t => {
  const fixtureState = await fixture(t);
  const { highlight, highlightTokens } = fixtureState;
  const first = highlightTokens("const value = 1", "typescript", "dark");
  const expected = ["<span>const value = 1</span>"];
  fixtureState.worker.finish([...expected]);
  const initial = await first;
  initial[0] = "changed by first caller";
  const reopened = await highlightTokens("const value = 1", "typescript", "dark");
  assert.deepEqual(reopened, expected);
  reopened.push("changed by second caller");
  assert.deepEqual(await highlightTokens("const value = 1", "typescript", "dark"), expected);
  assert.equal(fixtureState.worker.requests.length, 0);
  const variants = [
    highlightTokens("const value = 1", "typescript", "light"),
    highlightTokens("const value = 1", "javascript", "dark"),
    highlightTokens("const value = 2", "typescript", "dark"),
    highlight("const value = 1", "typescript", "dark"),
  ];
  assert.equal(fixtureState.worker.requests.length, 4);
  for (let index = 0; index < 3; index++) fixtureState.worker.finish([`variant ${index}`]);
  fixtureState.worker.finish("html variant");
  await Promise.all(variants);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await highlightTokens("const value = 1", "typescript", "dark", controller.signal), null);
  const unsupported = highlightTokens("unsupported", "unknown", "dark");
  fixtureState.worker.finish(null);
  assert.equal(await unsupported, null);
  const retry = highlightTokens("unsupported", "unknown", "dark");
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish(null);
  assert.equal(await retry, null);
});

test("HTML and tokens share a bounded cache with recent entries retained", async t => {
  const fixtureState = await fixture(t);
  const { highlight, highlightTokens } = fixtureState;
  const render = async (code, result, html = false) => {
    const pending = html ? highlight(code, "typescript", "dark") : highlightTokens(code, "typescript", "dark");
    fixtureState.worker.finish(result);
    return pending;
  };
  await render("first", ["first tokens"]);
  await render("second", ["second tokens"]);
  await highlightTokens("first", "typescript", "dark");
  const largeHtml = "h".repeat(700_000);
  await render("large html", largeHtml, true);
  const largeTokens = ["t".repeat(300_000)];
  await render("large tokens", largeTokens);
  const retained = await highlightTokens("first", "typescript", "dark");
  assert.deepEqual(retained, ["first tokens"]);
  assert.equal(fixtureState.worker.requests.length, 0);
  await render("eviction", ["e".repeat(100_000)]);
  assert.deepEqual(await highlightTokens("large tokens", "typescript", "dark"), largeTokens);
  const evicted = highlight("large html", "typescript", "dark");
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish("replacement html");
  await evicted;
  const oversized = ["x".repeat(1024 * 1024)];
  await render("oversized", oversized);
  const repeated = highlightTokens("oversized", "typescript", "dark");
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish(oversized);
  await repeated;
});

test("token cache limits the number of small retained results", async t => {
  const fixtureState = await fixture(t);
  const { highlightTokens } = fixtureState;
  for (let index = 0; index < 128; index++) {
    const pending = highlightTokens(String(index), "typescript", "dark");
    fixtureState.worker.finish([String(index)]);
    await pending;
  }
  assert.deepEqual(await highlightTokens("0", "typescript", "dark"), ["0"]);
  const added = highlightTokens("128", "typescript", "dark");
  fixtureState.worker.finish(["128"]);
  await added;
  assert.deepEqual(await highlightTokens("0", "typescript", "dark"), ["0"]);
  const oldest = highlightTokens("1", "typescript", "dark");
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish(["1"]);
  await oldest;
});

test("concurrent token callers share worker transfers and receive independent arrays", async t => {
  const fixtureState = await fixture(t);
  const { highlightTokens } = fixtureState;
  const calls = Array.from({ length: 20 }, () => highlightTokens("same source", "typescript", "dark"));
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish(["first line", "second line"]);
  const results = await Promise.all(calls);
  assert.equal(new Set(results).size, results.length);
  results[0][0] = "changed";
  results[0].push("extra");
  for (const result of results.slice(1)) assert.deepEqual(result, ["first line", "second line"]);
  assert.deepEqual(await highlightTokens("same source", "typescript", "dark"), ["first line", "second line"]);
  assert.equal(fixtureState.worker.requests.length, 0);
});

test("aborting one token consumer preserves peers and the eventual cache entry", async t => {
  const fixtureState = await fixture(t);
  const controller = new AbortController();
  const cancelled = fixtureState.highlightTokens("shared", "typescript", "dark", controller.signal);
  const retained = fixtureState.highlightTokens("shared", "typescript", "dark");
  controller.abort();
  assert.equal(await cancelled, null);
  assert.equal(fixtureState.worker.requests.length, 1);
  assert.deepEqual(fixtureState.worker.cancellations, []);
  fixtureState.worker.finish(["retained"]);
  assert.deepEqual(await retained, ["retained"]);
  assert.deepEqual(await fixtureState.highlightTokens("shared", "typescript", "dark"), ["retained"]);
  assert.equal(fixtureState.worker.requests.length, 0);
});

test("HTML consumers cancel independently without caching the cancelled fallback", async t => {
  const fixtureState = await fixture(t);
  const controller = new AbortController();
  const cancelled = fixtureState.highlight("<shared>", "typescript", "dark", controller.signal);
  const retained = fixtureState.highlight("<shared>", "typescript", "dark");
  controller.abort();
  assert.equal(await cancelled, '<pre class="raw"><code>&lt;shared&gt;</code></pre>');
  assert.deepEqual(fixtureState.worker.cancellations, []);
  fixtureState.worker.finish("highlighted HTML");
  assert.equal(await retained, "highlighted HTML");
  assert.equal(await fixtureState.highlight("<shared>", "typescript", "dark"), "highlighted HTML");
});

test("the last cancelled consumer cancels its worker job and permits immediate retry", async t => {
  const fixtureState = await fixture(t);
  const first = new AbortController();
  const second = new AbortController();
  const calls = [first, second].map(controller => fixtureState.highlightTokens("retry", "typescript", "dark", controller.signal));
  const oldId = fixtureState.worker.requests[0].id;
  first.abort();
  assert.deepEqual(fixtureState.worker.cancellations, []);
  second.abort();
  assert.deepEqual(fixtureState.worker.cancellations, [oldId]);
  const retry = fixtureState.highlightTokens("retry", "typescript", "dark");
  assert.equal(fixtureState.worker.requests.length, 2);
  fixtureState.worker.finish(["late cancelled result"]);
  fixtureState.worker.finish(["fresh result"]);
  assert.deepEqual(await Promise.all(calls), [null, null]);
  assert.deepEqual(await retry, ["fresh result"]);
  assert.deepEqual(await fixtureState.highlightTokens("retry", "typescript", "dark"), ["fresh result"]);
});

test("shared failures and worker disposal allow retries without retaining failed jobs", async t => {
  const fixtureState = await fixture(t);
  const calls = Array.from({ length: 3 }, () => fixtureState.highlightTokens("failure", "typescript", "dark"));
  fixtureState.worker.finish(null);
  assert.deepEqual(await Promise.all(calls), [null, null, null]);
  const retry = fixtureState.highlightTokens("failure", "typescript", "dark");
  assert.equal(fixtureState.worker.requests.length, 1);
  fixtureState.worker.finish(["retried"]);
  assert.deepEqual(await retry, ["retried"]);
  const tokens = fixtureState.highlightTokens("disposed", "typescript", "dark");
  const html = fixtureState.highlight("disposed", "typescript", "dark");
  const failedWorker = fixtureState.worker;
  failedWorker.onerror();
  assert.equal(await tokens, null);
  assert.equal(await html, '<pre class="raw"><code>disposed</code></pre>');
  assert.equal(failedWorker.terminated, true);
  const recovered = fixtureState.highlightTokens("disposed", "typescript", "dark");
  assert.notStrictEqual(fixtureState.worker, failedWorker);
  fixtureState.worker.finish(["recovered"]);
  assert.deepEqual(await recovered, ["recovered"]);
});

test("a shared worker deadline releases every consumer and allows recovery", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixtureState = await fixture(t);
  const calls = Array.from({ length: 3 }, () => fixtureState.highlightTokens("timeout", "typescript", "dark"));
  const timedOutWorker = fixtureState.worker;
  assert.equal(timedOutWorker.requests.length, 1);
  t.mock.timers.tick(30_000);
  assert.deepEqual(await Promise.all(calls), [null, null, null]);
  assert.equal(timedOutWorker.terminated, true);
  const recovered = fixtureState.highlightTokens("timeout", "typescript", "dark");
  fixtureState.worker.finish(["recovered"]);
  assert.deepEqual(await recovered, ["recovered"]);
});
