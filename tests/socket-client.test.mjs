import assert from "node:assert/strict";
import { test } from "node:test";
import { SocketStream } from "../server/socket-stream.ts";
import { useApp } from "../web/src/lib/app-state.ts";
import { loadThread } from "../web/src/lib/actions.ts";
import { releaseHistoryRequest } from "../web/src/lib/history-cache.ts";
import { connectEnvironment, switchConnection, syncConnections } from "../web/src/lib/socket.ts";

const threads = ["F", "G"].map(id => ({ id, projectId: "project", title: id, updatedAt: 1, status: "idle", running: false }));
const message = text => ({ id: "reply", role: "assistant", ts: 1, parts: [{ id: "text", kind: "text", text, complete: false }] });
const history = text => ({ t: "thread.messages", threadId: "F", messages: [message(text)], page: { revision: 0 } });
const hello = (sequence = 0) => ({ t: "hello", epoch: "fixture", sequence, snapshot: { historyPaging: true, home: "/fixture", projects: [], threads, providers: [], permissions: [] } });

function fixture(t, state = {}, events = [hello()]) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const globals = new Map(["location", "localStorage", "requestAnimationFrame", "cancelAnimationFrame", "WebSocket"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const original = useApp.getState();
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    closes = 0;
    constructor(url) { this.url = String(url); sockets.push(this); }
    send(encoded) {
      const event = JSON.parse(encoded);
      this.sent.push(event);
      this.onSend?.(event);
    }
    close() {
      this.closes++;
      this.readyState = 3;
      this.onclose?.();
    }
  }
  Object.assign(globalThis, {
    location: { origin: "http://127.0.0.1" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    WebSocket: FakeSocket,
  });
  useApp.setState({ ...useApp.getInitialState(), historyPaging: true, connected: true, activeThreadId: "F", threads: Object.fromEntries(threads.map(thread => [thread.id, thread])), loaded: {}, historyPages: {}, order: {}, messages: {}, parts: new Map(), historyBytes: {}, ...state }, true);
  const socket = new FakeSocket("ws://127.0.0.1:43210/socket?stream=1&threads=F");
  connectEnvironment("local", "http://127.0.0.1:43210", { socket, events });
  t.after(() => {
    syncConnections({ activeId: "local", endpoint: "", connections: [] });
    useApp.setState(original, true);
    releaseHistoryRequest("F");
    releaseHistoryRequest("G");
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    socket,
    sockets,
    receive: event => socket.onmessage({ data: JSON.stringify(event) }),
    flush: () => switchConnection("local", "local"),
  };
}

test("an initial page dropped during selection is reloaded with intervening deltas", t => {
  const { socket, receive, flush } = fixture(t);
  const wire = [];
  const stream = new SocketStream(0, ["F"], encoded => wire.push(JSON.parse(encoded)), event => event);
  t.after(() => stream.close());
  let text = "base";
  socket.onSend = event => {
    if (event.t === "thread.subscribe") stream.subscribe(event.ids);
    if (event.t === "thread.load") { stream.include(event.id); stream.push(history(text)); }
  };
  loadThread("F");
  useApp.setState({ activeThreadId: "G" });
  text += "+missed";
  stream.push({ t: "part.append", threadId: "F", messageId: "reply", partId: "text", text: "+missed", sequence: 1 });
  stream.flush();
  assert.deepEqual(wire.map(event => event.t), ["thread.messages", "event.batch"]);
  assert.deepEqual(wire[1].events, []);
  for (const event of wire.splice(0)) receive(event);
  flush();
  assert.equal(useApp.getState().loaded.F, undefined);
  assert.equal(useApp.getState().parts.has("text"), false);
  useApp.setState({ activeThreadId: "F" });
  loadThread("F");
  assert.equal(socket.sent.filter(event => event.t === "thread.load").length, 2);
  for (const event of wire.splice(0)) receive(event);
  flush();
  assert.equal(useApp.getState().loaded.F, true);
  assert.equal(useApp.getState().parts.get("text").text, "base+missed");
});

test("an explicit non-active history load retains its paged reply", t => {
  const { socket, receive, flush } = fixture(t, { activeThreadId: "G" });
  socket.onSend = event => { if (event.t === "thread.load") receive(history("background")); };
  loadThread("F");
  flush();
  assert.equal(useApp.getState().activeThreadId, "G");
  assert.equal(useApp.getState().loaded.F, true);
  assert.equal(useApp.getState().parts.get("text").text, "background");
});

test("prepared pages preserve their socket subscriptions until their events apply", t => {
  const { socket } = fixture(t, { activeThreadId: "G" }, [hello(), history("prepared")]);
  assert.equal(useApp.getState().activeThreadId, "G");
  assert.equal(useApp.getState().loaded.F, true);
  assert.equal(useApp.getState().parts.get("text").text, "prepared");
  assert.deepEqual(socket.sent.filter(event => event.t === "thread.subscribe").map(event => event.ids), [["F", "G"]]);
});

test("empty batches advance the cursor and a gap reconnects without reusing it", t => {
  const { socket, sockets, receive, flush } = fixture(t, {}, [hello(10), history("base")]);
  receive({ t: "event.batch", after: 10, sequence: 12, events: [] });
  receive({ t: "event.batch", after: 12, sequence: 15, events: [{ t: "part.append", threadId: "F", messageId: "reply", partId: "text", text: "+ordered", sequence: 15 }] });
  flush();
  assert.equal(socket.closes, 0);
  assert.equal(useApp.getState().parts.get("text").text, "base+ordered");
  receive({ t: "event.batch", after: 16, sequence: 17, events: [{ t: "part.append", threadId: "F", messageId: "reply", partId: "text", text: "+gap", sequence: 17 }] });
  assert.equal(socket.closes, 1);
  assert.equal(useApp.getState().parts.get("text").text, "base+ordered");
  t.mock.timers.tick(400);
  assert.equal(sockets.length, 2);
  const query = new URL(sockets[1].url).searchParams;
  assert.equal(query.has("epoch"), false);
  assert.equal(query.has("after"), false);
  assert.equal(query.get("threads"), "F");
});
