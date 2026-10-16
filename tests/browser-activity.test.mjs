import assert from "node:assert/strict";
import { test } from "node:test";
import { browserActivity } from "../desktop/browser-activity.ts";

function fixture(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let rendering = false;
  let active = false;
  const activity = browserActivity(
    (value) => {
      rendering = value;
    },
    async (value) => {
      active = value;
    },
  );
  t.after(() => activity.dispose());
  return { activity, rendering: () => rendering, active: () => active };
}

test("idle browsers stop rendering after tool grace and stay active while presented", async (t) => {
  const { activity, rendering, active } = fixture(t);
  assert.equal(rendering(), false);
  await activity.run(async () => {
    assert.equal(rendering(), true);
    assert.equal(active(), true);
  });
  t.mock.timers.tick(29_999);
  assert.equal(rendering(), true);
  t.mock.timers.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rendering(), false);
  assert.equal(active(), false);
  activity.present(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rendering(), true);
  assert.equal(active(), true);
  activity.present(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rendering(), false);
  assert.equal(active(), false);
  await activity.run(async () => assert.equal(rendering(), true));
});

test("overlapping and long browser tools stay active until the final operation settles", async (t) => {
  const { activity, rendering, active } = fixture(t);
  let finish;
  const pending = activity.run(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await assert.rejects(
    activity.run(async () => {
      throw new Error("Navigation failed");
    }),
    /Navigation failed/,
  );
  t.mock.timers.tick(60_000);
  assert.equal(rendering(), true);
  assert.equal(active(), true);
  finish();
  await pending;
  t.mock.timers.tick(30_000);
  assert.equal(rendering(), false);
});

test("a presented browser stays active after tools go idle", async (t) => {
  const { activity, rendering, active } = fixture(t);
  activity.present(true);
  await activity.run(async () => {});
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rendering(), true);
  assert.equal(active(), true);
});

test("closed browsers cannot be revived by pending tools or idle timers", async (t) => {
  const { activity } = fixture(t);
  let finish;
  const pending = activity.run(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  activity.dispose();
  finish();
  await pending;
  t.mock.timers.tick(60_000);
  await assert.rejects(
    activity.run(async () => {}),
    /closed/,
  );
});

test("a new tool waits for an in-flight idle transition before activating the page", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  let finishIdle;
  const activity = browserActivity(
    () => {},
    (value) => {
      calls.push(value);
      return value
        ? Promise.resolve()
        : new Promise((resolve) => {
            finishIdle = resolve;
          });
    },
  );
  t.after(() => activity.dispose());
  await activity.run(async () => {});
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  let ran = false;
  const next = activity.run(async () => {
    ran = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [true, false]);
  assert.equal(ran, false);
  finishIdle();
  await next;
  assert.deepEqual(calls, [true, false, true]);
  assert.equal(ran, true);
});
