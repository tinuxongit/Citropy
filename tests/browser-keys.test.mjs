import assert from "node:assert/strict";
import { test } from "node:test";
import { keyEvents, pressKey } from "../desktop/browser-keys.ts";

test("printable keys and Enter send text, shortcuts do not", () => {
  assert.deepEqual(keyEvents("a"), [
    { type: "keyDown", keyCode: "a", modifiers: [] },
    { type: "char", keyCode: "a", modifiers: [] },
    { type: "keyUp", keyCode: "a", modifiers: [] },
  ]);
  assert.deepEqual(
    keyEvents("Enter").map((event) => event.keyCode),
    ["Enter", "\r", "Enter"],
  );
  assert.deepEqual(
    keyEvents("Space").map((event) => event.keyCode),
    ["Space", " ", "Space"],
  );
  assert.deepEqual(keyEvents("Shift+A")[1], { type: "char", keyCode: "A", modifiers: ["shift"] });
  assert.deepEqual(keyEvents("Control+A"), [
    { type: "keyDown", keyCode: "A", modifiers: ["control"] },
    { type: "keyUp", keyCode: "A", modifiers: ["control"] },
  ]);
  assert.deepEqual(
    keyEvents("ArrowDown").map((event) => event.keyCode),
    ["Down", "Down"],
  );
});

test("unknown keys and modifiers are rejected", () => {
  for (const combo of ["F13", "Hyper+A", "", "Control+"])
    assert.throws(() => keyEvents(combo), /standard key name/);
});

test("keys go to the page's own contents", () => {
  const sent = [];
  pressKey({ sendInputEvent: (event) => sent.push(event) }, "Escape");
  assert.deepEqual(
    sent.map((event) => event.type),
    ["keyDown", "keyUp"],
  );
});
