import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WebSocket } from "ws";
import { freePort } from "../shared/ports.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-socket-"));
  const port = await freePort();
  const script = `
    import { providers } from './server/providers/index.ts';
    import { store } from './server/store.ts';
    import { bus } from './server/bus.ts';
    import { WebSocket } from 'ws';
    globalThis.fetch = async () => { throw new Error('Network disabled in socket fixture'); };
    for (const provider of Object.values(providers)) {
      provider.detect = async () => ({ available: false });
      provider.binary = 'citropy-missing-fixture-' + provider.id;
    }
    const project = store.openProject(process.cwd());
    const thread = store.createThread({ projectId: project.id, provider: 'claude', title: 'Large history' });
    store.addMessage(thread.id, { id: 'message', role: 'assistant', ts: 1, parts: [{ id: 'text', kind: 'text', text: 'x'.repeat(12 * 1024 * 1024), complete: true }] });
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data, ...args) {
      const result = originalSend.call(this, data, ...args);
      if (JSON.parse(data).t === 'thread.messages') {
        process.send({ t: 'history-sent', buffered: this.bufferedAmount });
        bus.emit({ t: 'toast', level: 'info', text: 'Live update' });
      }
      return result;
    };
    process.on('message', message => {
      if (message.t !== 'flood') return;
      for (let index = 0; index < 32; index++) bus.emit({ t: 'toast', level: 'info', text: String(index) + 'x'.repeat(512 * 1024) });
      process.send({ t: 'flooded' });
    });
    await import('./server/main.ts');
  `;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, CITROPY_DATA_DIR: directory, CITROPY_HOST: "127.0.0.1", CITROPY_PORT: String(port), CITROPY_REMOTE_ID: "", CITROPY_REMOTE_TOKEN: "", CITROPY_DEVELOPMENT: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let log = "";
  child.stdout.on("data", chunk => { log += chunk; });
  child.stderr.on("data", chunk => { log += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
    await rm(directory, { recursive: true, force: true });
  });
  const waitFor = type => new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Backend did not send ${type}: ${log}`)), 10_000);
    const receive = message => { if (message.t === type) finish(undefined, message); };
    const exited = code => finish(new Error(`Backend exited ${code}: ${log}`));
    const finish = (error, message) => {
      clearTimeout(timer);
      child.off("message", receive);
      child.off("exit", exited);
      error ? reject(error) : resolve(message);
    };
    child.on("message", receive);
    child.once("exit", exited);
  });
  await waitFor("ready");
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  t.after(() => socket.terminate());
  const events = [];
  const closed = [];
  socket.on("close", (code, reason) => closed.push({ code, reason: reason.toString() }));
  const hello = await new Promise((resolve, reject) => {
    socket.on("message", raw => {
      const event = JSON.parse(raw);
      events.push(event);
      if (event.t === "hello") resolve(event);
    });
    socket.on("error", reject);
  });
  return { child, socket, events, closed, hello, waitFor };
}

test("a large history transfer does not disconnect chats when a live update arrives", { timeout: 20_000 }, async t => {
  const { socket, events, closed, hello, waitFor } = await fixture(t);
  const sent = waitFor("history-sent");
  socket.pause();
  socket.send(JSON.stringify({ t: "thread.load", id: hello.snapshot.threads[0].id }));
  assert.ok((await sent).buffered > 1024 * 1024);
  socket.resume();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The history and live update did not arrive")), 5000);
    const check = () => {
      if (closed.length) { clearTimeout(timer); reject(new Error(`Shared socket disconnected: ${JSON.stringify(closed)}`)); }
      else if (events.some(event => event.t === "toast" && event.text === "Live update")) { clearTimeout(timer); resolve(); }
      else setTimeout(check, 10);
    };
    check();
  });
  assert.ok(events.some(event => event.t === "thread.messages" && event.messages[0].parts[0].text.length === 12 * 1024 * 1024));
  assert.deepEqual(closed, []);
  assert.equal(socket.readyState, WebSocket.OPEN);
  const sequences = events.filter(event => event.t !== "hello" && event.sequence !== undefined).map(event => event.sequence);
  assert.deepEqual(sequences, sequences.map((_, index) => hello.sequence + index + 1));
});

test("an unread shared socket still disconnects when its queued updates exceed the bound", { timeout: 20_000 }, async t => {
  const { child, socket, closed, waitFor } = await fixture(t);
  const flooded = waitFor("flooded");
  socket.pause();
  child.send({ t: "flood" });
  await flooded;
  const disconnect = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The slow client was not disconnected")), 5000);
    socket.once("close", () => { clearTimeout(timer); resolve(); });
  });
  socket.resume();
  await disconnect;
  assert.deepEqual(closed, [{ code: 1013, reason: "The connection fell behind. Reconnecting." }]);
});
