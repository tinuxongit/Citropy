import assert from "node:assert/strict";
import { test } from "node:test";
import { memoizeAsync } from "../web/src/lib/memoize-async.ts";

test("a successful result is loaded once", async () => {
  let calls = 0;
  const load = memoizeAsync(async (key) => {
    calls++;
    return `value ${key}`;
  });
  assert.equal(await load("a"), "value a");
  assert.equal(await load("a"), "value a");
  assert.equal(calls, 1);
});

test("concurrent callers share one load", async () => {
  let calls = 0;
  const load = memoizeAsync(async (key) => {
    calls++;
    return key;
  });
  assert.deepEqual(await Promise.all([load("a"), load("a"), load("a")]), ["a", "a", "a"]);
  assert.equal(calls, 1);
});

test("a rejected load is retried by the next call", async () => {
  let calls = 0;
  const load = memoizeAsync(async (key) => {
    calls++;
    if (calls === 1) throw new Error("offline");
    return key;
  });
  await assert.rejects(load("a"), /offline/);
  assert.equal(await load("a"), "a");
  assert.equal(await load("a"), "a");
  assert.equal(calls, 2);
});

test("a failed key does not affect another key", async () => {
  const load = memoizeAsync(async (key) => {
    if (key === "bad") throw new Error("offline");
    return key;
  });
  assert.equal(await load("good"), "good");
  await assert.rejects(load("bad"), /offline/);
  assert.equal(await load("good"), "good");
});
