import assert from "node:assert/strict";
import { test } from "node:test";

const { selectionForChat } = await import("../web/src/components/editor/selection-for-chat.ts");

const selection = (startLineNumber, endLineNumber, endColumn) => ({ startLineNumber, endLineNumber, endColumn });
const model = (code, language = "typescript") => ({ getValueInRange: () => code, getLanguageId: () => language });

test("Saved selections become a line reference", () => {
  const document = { path: "src/app.ts", dirty: false, model: model("") };
  assert.equal(selectionForChat(selection(12, 30, 8), document), "@[src/app.ts]#L12-L30");
  assert.equal(selectionForChat(selection(4, 4, 9), document), "@[src/app.ts]#L4");
});

test("A selection ending at the start of a line leaves that line out", () => {
  assert.equal(selectionForChat(selection(3, 6, 1), { path: "a.ts", dirty: false, model: model("") }), "@[a.ts]#L3-L5");
});

test("Unsaved selections send the code itself", () => {
  const document = { path: "notes.md", dirty: true, model: model("Run ```npm test```\n", "markdown") };
  assert.equal(selectionForChat(selection(2, 3, 4), document), "Unsaved lines 2-3 of notes.md:\n````markdown\nRun ```npm test```\n````");
});
