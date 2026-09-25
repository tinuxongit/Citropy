import assert from "node:assert/strict";
import { test } from "node:test";

test("full connections keep independent slices and requests across focus switches", async () => {
  const frames = new Map();
  const sockets = [];
  let frameId = 0;
  let activeId = "local";
  let status = "connected";
  const listeners = new Set();
  const endpoint = "http://127.0.0.1:49121";
  const state = () => ({ activeId, endpoint: activeId === "local" ? "" : endpoint, connections: [{ id: "remote", name: "Remote", target: "user@host", port: 22, node: "node", status, endpoint }] });
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    sent = [];
    constructor(url) { this.url = new URL(url); sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    message(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const values = new Map();
  globalThis.window = { innerWidth: 1440, citropyDesktop: {
    environmentsState: async () => state(),
    onEnvironmentsState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    connectEnvironment: async id => { activeId = id; for (const listener of listeners) listener(state()); return state(); },
  } };
  globalThis.WebSocket = FakeWebSocket;
  globalThis.location = { origin: "http://127.0.0.1:4177", protocol: "http:", host: "127.0.0.1:4177" };
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const { initializeEnvironment, selectEnvironment, environmentId } = await import("../web/src/lib/environment.ts");
  const { connect, disconnect, backgroundEnvironments } = await import("../web/src/lib/socket.ts");
  const { environmentSlice, sendTo, updateEnvironmentSlice } = await import("../web/src/lib/live-environments.ts");
  const { useApp } = await import("../web/src/lib/store.ts");
  const { awaitResponse } = await import("../web/src/lib/requests.ts");
  const flush = () => { for (const callback of [...frames.values()]) callback(); };
  await initializeEnvironment();
  connect();
  assert.equal(sockets.length, 2);
  const remote = sockets.find(socket => socket.url.port === "49121");
  const local = sockets.find(socket => socket !== remote);
  const hello = (name, id) => ({ t: "hello", snapshot: { projects: [{ id, name, path: `/${id}`, lastOpened: 1 }], threads: [], providers: [], permissions: [], home: `/${id}` } });
  remote.open();
  local.open();
  remote.message(hello("Remote project", "remote-project"));
  local.message(hello("Local project", "local-project"));
  flush();
  assert.equal(environmentSlice("remote").projects[0].name, "Remote project");
  assert.equal(useApp.getState().projects[0].name, "Local project");
  assert.equal(backgroundEnvironments().remote.connected, true);
  const stable = backgroundEnvironments();
  assert.equal(backgroundEnvironments(), stable);
  updateEnvironmentSlice("remote", () => ({ activeProjectId: "remote-project" }));
  assert.equal(environmentSlice("remote").activeProjectId, "remote-project");
  remote.message({ t: "toast", level: "info", text: "Remote notice" });
  flush();
  assert.equal(useApp.getState().toasts.at(-1).text, "Remote notice");
  const remoteId = "remote-request";
  const localId = "local-request";
  const remotePending = awaitResponse(remoteId);
  const localPending = awaitResponse(localId);
  sendTo("remote", { t: "file.tree", projectId: "remote-project", requestId: remoteId });
  sendTo("local", { t: "file.tree", projectId: "local-project", requestId: localId });
  await selectEnvironment("remote");
  assert.equal(sockets.length, 2);
  assert.equal(environmentId(), "remote");
  assert.equal(useApp.getState().projects[0].name, "Remote project");
  assert.equal(backgroundEnvironments().remote, undefined);
  assert.equal(backgroundEnvironments().local.projects[0].name, "Local project");
  assert.equal(useApp.getState().toasts.at(-1).text, "Remote notice");
  remote.close();
  await assert.rejects(remotePending, /interrupted/);
  local.message({ t: "file.tree", requestId: localId, entries: [] });
  flush();
  assert.deepEqual(await localPending, []);
  await selectEnvironment("local");
  assert.equal(sockets.length, 2);
  assert.equal(useApp.getState().projects[0].name, "Local project");
  assert.equal(JSON.parse(values.get("citropy.workspaces")).remote.connected, false);
  status = "disconnected";
  for (const listener of listeners) listener(state());
  disconnect();
  for (const key of ["window", "WebSocket", "location", "localStorage", "requestAnimationFrame", "cancelAnimationFrame"]) delete globalThis[key];
});
