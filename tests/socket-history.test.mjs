import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WebSocket } from "ws";

test("paged selective sockets preserve durable replay, global state and subscription changes", { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-history-socket-"));
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const script = `
    import { providers } from './server/providers/index.ts';
    import { store } from './server/store.ts';
    import { bus } from './server/bus.ts';
    import { eventJournal } from './server/event-journal.ts';
    globalThis.fetch = async () => { throw new Error('Network disabled in history fixture'); };
    for (const provider of Object.values(providers)) provider.detect = async () => ({ available: false });
    const project = store.openProject(process.cwd());
    const threads = ['selected', 'other'].map(title => store.createThread({ projectId: project.id, provider: 'claude', title }));
    for (const thread of threads) for (let index = 0; index < 200; index++) store.addMessage(thread.id, { id: thread.title + index, role: 'assistant', ts: index, parts: [{ id: thread.title + '-part-' + index, kind: 'text', text: 'message ' + index, complete: true }] });
    process.on('message', message => {
      if (message.t === 'burst') {
        for (let index = 0; index < 100; index++) for (const thread of threads) store.appendText(thread.id, thread.title + 199, thread.title + '-part-199', 'x');
        bus.emit({ t: 'permission.close', id: 'global-permission' });
        process.send({ t: 'burst-done', sequence: eventJournal.sequence });
      } else if (message.t === 'replace') {
        store.replaceMessages(threads[0].id, [{ id: 'replacement', role: 'assistant', ts: 1, parts: [{ id: 'replacement-part', kind: 'text', text: 'base' }] }]);
        store.appendText(threads[0].id, 'replacement', 'replacement-part', '+delta');
        process.send({ t: 'replace-done', sequence: eventJournal.sequence });
      }
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
  const waitForChild = type => new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Missing ${type}: ${log}`)), 10000);
    const receive = message => { if (message.t === type) finish(undefined, message); };
    const finish = (error, message) => { clearTimeout(timer); child.off("message", receive); error ? reject(error) : resolve(message); };
    child.on("message", receive);
  });
  await waitForChild("ready");
  async function connect(query) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket?stream=1&${query}`);
    t.after(() => socket.terminate());
    const events = [];
    socket.on("message", raw => events.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const waitFor = predicate => new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const event = events.find(predicate);
        if (event) resolve(event);
        else if (Date.now() - started > 5000) reject(new Error(`Socket response missing: ${JSON.stringify(events)} ${log}`));
        else setTimeout(check, 10);
      };
      check();
    });
    return { socket, events, waitFor };
  }
  const live = await connect("");
  const hello = await live.waitFor(event => event.t === "hello");
  assert.equal(hello.snapshot.historyPaging, true);
  const selected = hello.snapshot.threads.find(thread => thread.title === "selected").id;
  const other = hello.snapshot.threads.find(thread => thread.title === "other").id;
  live.socket.send(JSON.stringify({ t: "thread.subscribe", ids: [selected] }));
  live.socket.send(JSON.stringify({ t: "thread.load", id: selected, page: {}, requestId: "latest" }));
  const latest = await live.waitFor(event => event.requestId === "latest");
  assert.equal(latest.messages.length, 80);
  assert.equal(latest.messages[0].id, "selected120");
  live.socket.send(JSON.stringify({ t: "thread.load", id: selected, page: { before: latest.page.next, revision: latest.page.revision }, requestId: "older" }));
  assert.equal((await live.waitFor(event => event.requestId === "older")).messages[0].id, "selected40");
  const done = waitForChild("burst-done");
  child.send({ t: "burst" });
  const { sequence } = await done;
  await live.waitFor(event => event.t === "event.batch" && event.sequence === sequence);
  const frames = live.events.filter(event => event.t === "event.batch");
  let cursor = hello.sequence;
  for (const frame of frames) { assert.equal(frame.after, cursor); cursor = frame.sequence; }
  assert.equal(cursor, sequence);
  const updates = frames.flatMap(frame => frame.events);
  assert.ok(updates.some(event => event.t === "permission.close"));
  assert.ok(updates.every(event => !event.threadId || event.threadId === selected));
  assert.equal(updates.filter(event => event.t === "part.append").map(event => event.text).join(""), "x".repeat(100));
  assert.ok(updates.length < 10);
  live.socket.close();
  await new Promise(resolve => live.socket.once("close", resolve));
  const replaced = waitForChild("replace-done");
  child.send({ t: "replace" });
  const replacementSequence = (await replaced).sequence;
  const replay = await connect(`epoch=${hello.epoch}&after=${sequence}&threads=${selected}`);
  await replay.waitFor(event => event.t === "reconnected");
  const replayed = replay.events.filter(event => event.t === "event.batch");
  assert.equal(replayed[0].after, sequence);
  assert.equal(replayed.at(-1).sequence, replacementSequence);
  const reset = replayed.flatMap(frame => frame.events).find(event => event.t === "thread.messages");
  assert.equal(reset.messages[0].parts[0].text, "base");
  assert.equal(replayed.flatMap(frame => frame.events).find(event => event.t === "part.append").text, "+delta");
  replay.socket.send(JSON.stringify({ t: "thread.subscribe", ids: [other] }));
  replay.socket.send(JSON.stringify({ t: "thread.load", id: other, page: {}, requestId: "switched" }));
  assert.equal((await replay.waitFor(event => event.requestId === "switched")).messages.at(-1).parts[0].text, "message 199" + "x".repeat(100));
});
