import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { bus } from "../server/bus.ts";
import { openPanel, closePanel, panelList } from "../server/panels.ts";
import { panelRoutes } from "../server/routes/panels.ts";

test("docked terminal creation marks its update as background without changing normal panel updates", t => {
  const events = [];
  const unsubscribe = bus.subscribe(event => events.push(event));
  t.after(() => {
    unsubscribe();
    closePanel("editor-shell");
    closePanel("normal-shell");
  });
  openPanel("workspace", "terminal", "thread", "editor-shell", true);
  openPanel("workspace", "terminal", "thread", "normal-shell");
  const updates = events.filter(event => event.t === "panel.upsert");
  assert.equal(updates[0].background, true);
  assert.equal(updates[0].panel.threadId, "thread");
  assert.equal(updates[1].background, undefined);
});

test("terminal names and workspace tab order update the shared panel registry", (t) => {
  const events = [];
  const unsubscribe = bus.subscribe((event) => events.push(event));
  const ids = ["files", "shell-a", "shell-b", "other-workspace"];
  t.after(() => {
    unsubscribe();
    ids.forEach(closePanel);
  });
  const files = openPanel("workspace", "files", undefined, ids[0]);
  const first = openPanel("workspace", "terminal", "thread", ids[1], true);
  const second = openPanel("workspace", "terminal", "thread", ids[2], true);
  const other = openPanel("other", "terminal", undefined, ids[3]);
  events.length = 0;
  panelRoutes["panel.rename"]({ t: "panel.rename", id: first.id, title: "  Dev server  " });
  assert.equal(first.title, "Dev server");
  assert.deepEqual(events[0], { t: "panel.upsert", panel: { ...first }, background: true, sequence: events[0].sequence });
  panelRoutes["panel.move"]({ t: "panel.move", id: second.id, targetId: files.id, edge: "before" });
  assert.deepEqual(panelList(), [second, files, first, other]);
  assert.deepEqual(events[1], { t: "panel.order", projectId: "workspace", ids: [second.id, files.id, first.id], sequence: events[1].sequence });
  panelRoutes["panel.move"]({ t: "panel.move", id: second.id, targetId: first.id, edge: "after" });
  assert.deepEqual(panelList(), [files, first, second, other]);
  const beforeInvalid = panelList();
  const corrections = [];
  const move = (event) => panelRoutes["panel.move"](event, (event) => corrections.push(event));
  for (const title of ["", "   ", "x".repeat(101), null, 42])
    assert.throws(() => panelRoutes["panel.rename"]({ t: "panel.rename", id: first.id, title }), /terminal name/);
  assert.throws(() => panelRoutes["panel.rename"]({ t: "panel.rename", id: files.id, title: "New" }), /Terminal not found/);
  assert.throws(() => panelRoutes["panel.rename"]({ t: "panel.rename", id: "missing", title: "New" }), /Terminal not found/);
  assert.throws(() => move({ t: "panel.move", id: first.id, targetId: other.id, edge: "before" }), /different workspaces/);
  assert.throws(() => move({ t: "panel.move", id: first.id, targetId: "missing", edge: "before" }), /Panel not found/);
  assert.throws(() => move({ t: "panel.move", id: first.id, targetId: files.id, edge: "invalid" }), /Invalid panel position/);
  assert.deepEqual(corrections[1], { t: "panel.order", projectId: "workspace", ids: [files.id, first.id, second.id] });
  assert.deepEqual(panelList(), beforeInvalid);
  assert.equal(first.title, "Dev server");
});
