import assert from "node:assert/strict";
import test from "node:test";
import { neighborTab, withKeptTab, withoutTab, withPreviewTab } from "../web/src/lib/thread-tabs.ts";

const tabs = (openThreadIds, previewThreadId = null, activeThreadId = openThreadIds[0] ?? null) =>
  ({ openThreadIds, previewThreadId, activeThreadId });

test("opening a conversation replaces the preview tab in place", () => {
  assert.deepEqual(withPreviewTab(tabs(["a", "b", "c"], "b"), "d"), { openThreadIds: ["a", "d", "c"], previewThreadId: "d" });
});

test("opening a conversation without a preview adds it after the active tab", () => {
  assert.deepEqual(withPreviewTab(tabs(["a", "b"], null, "a"), "c"), { openThreadIds: ["a", "c", "b"], previewThreadId: "c" });
});

test("opening an open conversation keeps the tabs", () => {
  const state = tabs(["a", "b"], "b");
  assert.equal(withPreviewTab(state, "a"), state);
});

test("keeping a preview tab makes it permanent", () => {
  assert.deepEqual(withKeptTab(tabs(["a", "b"], "b"), "b").previewThreadId, null);
});

test("keeping a closed conversation opens it after the active tab", () => {
  assert.deepEqual(withKeptTab(tabs(["a", "b"], "b", "a"), "c"), tabs(["a", "c", "b"], "b", "a"));
});

test("closing a tab clears its preview and picks the next neighbor", () => {
  assert.deepEqual(withoutTab(tabs(["a", "b", "c"], "b"), "b"), { openThreadIds: ["a", "c"], previewThreadId: null });
  assert.equal(neighborTab(["a", "b", "c"], "b"), "c");
  assert.equal(neighborTab(["a", "b", "c"], "c"), "b");
  assert.equal(neighborTab(["a"], "a"), null);
});
