import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const stored = new Map();
globalThis.localStorage = {
  get length() { return stored.size; },
  key: (index) => [...stored.keys()][index] ?? null,
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
};

const { useApp, selectPanel, setEditorTerminal, applyEvents, resetEnvironment } = await import("../web/src/lib/store.ts");
const initial = useApp.getState();
const panels = [
  { id: "files", projectId: "project", kind: "files", title: "Files" },
  { id: "changes", projectId: "project", kind: "changes", title: "Changes" },
  { id: "terminal", projectId: "project", threadId: "thread", kind: "terminal", title: "Terminal 1" },
];

afterEach(() => {
  useApp.setState(initial, true);
  stored.clear();
});

test("terminal selection docks beside the active editor and retains the chosen shell when hidden", () => {
  useApp.setState({ panels, activeProjectId: "project", activeThreadId: "thread", activePanels: { project: "files" } });
  selectPanel("terminal");
  assert.equal(useApp.getState().activePanels.project, "files");
  assert.deepEqual(useApp.getState().editorTerminals.files, { id: "terminal", threadId: "thread", visible: true });
  setEditorTerminal("files");
  assert.deepEqual(useApp.getState().editorTerminals.files, { id: "terminal", threadId: "thread", visible: false });
  selectPanel("terminal");
  assert.equal(useApp.getState().editorTerminals.files.visible, true);
  assert.equal(useApp.getState().activePanels.project, "files");
});

test("terminal panels still open on their own outside the editor", () => {
  useApp.setState({ panels, activeProjectId: "project", activePanels: { project: "changes" } });
  selectPanel("terminal");
  assert.equal(useApp.getState().activePanels.project, "terminal");
  assert.deepEqual(useApp.getState().editorTerminals, {});
});

test("closing a terminal or editor and switching environments clears its dock state", () => {
  useApp.setState({ panels, activeProjectId: "project", activePanels: { project: "files" } });
  selectPanel("terminal");
  useApp.setState((state) => applyEvents(state, [{ t: "panel.remove", id: "terminal" }]));
  assert.deepEqual(useApp.getState().editorTerminals, {});
  assert.equal(useApp.getState().activePanels.project, "files");
  useApp.setState({ panels });
  selectPanel("terminal");
  useApp.setState((state) => applyEvents(state, [{ t: "panel.remove", id: "files" }]));
  assert.deepEqual(useApp.getState().editorTerminals, {});
  setEditorTerminal("files", "terminal");
  resetEnvironment([], "/home");
  assert.deepEqual(useApp.getState().editorTerminals, {});
});

test("reconnecting retains existing docks and removes shells that disappeared", () => {
  useApp.setState({ panels, activeProjectId: "project", activePanels: { project: "files" } });
  selectPanel("terminal");
  const snapshot = {
    projects: [{ id: "project", path: "/project", name: "Project", isGit: false, lastOpened: 1 }],
    threads: [], providers: [], permissions: [], home: "/home", panels,
  };
  useApp.setState((state) => applyEvents(state, [{ t: "hello", snapshot }]));
  assert.equal(useApp.getState().editorTerminals.files.id, "terminal");
  useApp.setState((state) => applyEvents(state, [{
    t: "hello",
    snapshot: { ...snapshot, panels: panels.filter((panel) => panel.id !== "terminal") },
  }]));
  assert.deepEqual(useApp.getState().editorTerminals, {});
  assert.equal(useApp.getState().activePanels.project, "files");
});

test("closing the selected dock tab keeps another shell open in the same workspace", () => {
  const terminals = [
    ...panels,
    { id: "second", projectId: "project", threadId: "thread", kind: "terminal", title: "Terminal 2" },
    { id: "other-thread", projectId: "project", threadId: "other", kind: "terminal", title: "Other thread" },
  ];
  useApp.setState({ panels: terminals, activeProjectId: "project", activeThreadId: "thread", activePanels: { project: "files" } });
  selectPanel("second");
  useApp.setState(state => applyEvents(state, [{ t: "panel.remove", id: "second" }]));
  assert.deepEqual(useApp.getState().editorTerminals.files, { id: "terminal", threadId: "thread", visible: true });
  assert.equal(useApp.getState().activePanels.project, "files");
  useApp.setState(state => applyEvents(state, [{ t: "panel.remove", id: "other-thread" }]));
  assert.equal(useApp.getState().editorTerminals.files.id, "terminal");
});

test("panel order updates preserve the active editor, dock session and unrelated workspaces", () => {
  const other = { id: "other", projectId: "other-project", kind: "files", title: "Files" };
  useApp.setState({
    panels: [...panels, other], activeProjectId: "project", activePanels: {},
    editorTerminals: { files: { id: "terminal", threadId: "thread", visible: true } },
  });
  const dock = useApp.getState().editorTerminals;
  useApp.setState((state) => applyEvents(state, [
    { t: "panel.upsert", panel: { ...panels[2], title: "Dev server" }, background: true },
    { t: "panel.order", projectId: "project", ids: ["terminal", "files", "changes"] },
  ]));
  assert.equal(useApp.getState().activePanels.project, "files");
  assert.equal(useApp.getState().editorTerminals, dock);
  assert.deepEqual(useApp.getState().panels.map((panel) => panel.id), ["terminal", "files", "changes", "other"]);
  assert.equal(useApp.getState().panels[0].title, "Dev server");
  assert.equal(useApp.getState().panels[3], other);
  useApp.setState((state) => applyEvents(state, [
    { t: "panel.order", projectId: "project", ids: ["missing", "changes", "changes", "other"] },
  ]));
  assert.deepEqual(useApp.getState().panels.map((panel) => panel.id), ["changes", "terminal", "files", "other"]);
  assert.equal(useApp.getState().activePanels.project, "files");
  const ordered = useApp.getState().panels;
  useApp.setState((state) => applyEvents(state, [{ t: "hello", snapshot: {
    projects: [{ id: "project", path: "/project", name: "Project", isGit: false, lastOpened: 1 }],
    threads: [], providers: [], permissions: [], home: "/home", panels: ordered,
  } }]));
  assert.equal(useApp.getState().panels, ordered);
  assert.equal(useApp.getState().panels[1].title, "Dev server");
  assert.equal(useApp.getState().editorTerminals.files.id, "terminal");
});
