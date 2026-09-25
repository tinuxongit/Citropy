import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

async function until(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("OpenCode did not reach the expected state");
}

test("OpenCode checks resumed sessions and forks when the workspace changes", async t => {
  const originalSpawn = childProcess.spawn;
  const requests = [];
  const streams = [];
  let lookupStatus = 200;
  let savedDirectory = process.cwd();
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader("content-type", "application/json");
    if (request.url === "/event") {
      streams.push(response);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": ready\n\n");
    } else if (request.url === "/session/saved" && request.method === "GET") {
      response.writeHead(lookupStatus);
      response.end(lookupStatus === 200 ? JSON.stringify({ id: "saved", directory: savedDirectory }) : "{}");
    } else if (request.url?.startsWith("/session/saved/fork?")) response.end(JSON.stringify({ id: "forked" }));
    else if (request.url === "/session" && request.method === "POST") response.end(JSON.stringify({ id: "new" }));
    else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  childProcess.spawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    queueMicrotask(() => child.stdout.write(`http://127.0.0.1:${server.address().port}\n`));
    return child;
  };
  syncBuiltinESMExports();
  const sessions = [];
  t.after(async () => {
    for (const session of sessions) session.dispose();
    for (const stream of streams) stream.end();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  });
  const { opencodeProvider } = await import("../server/providers/opencode.ts");
  const start = async () => {
    const events = [];
    const session = opencodeProvider.start({ threadId: "fixture", cwd: process.cwd(), externalId: "saved", permissionMode: "manual", emit: event => events.push(event) });
    sessions.push(session);
    await until(() => events.some(event => event.type === "session" || event.type === "exit"));
    return events;
  };

  let events = await start();
  assert.equal(events.find(event => event.type === "session").externalId, "saved");
  assert.equal(requests.some(request => request.method === "POST" && request.url === "/session"), false);

  lookupStatus = 404;
  requests.length = 0;
  events = await start();
  assert.equal(events.find(event => event.type === "session").externalId, "new");
  assert.ok(events.some(event => event.type === "notice" && /unavailable/.test(event.text)));
  assert.ok(requests.some(request => request.method === "POST" && request.url === "/session"));

  lookupStatus = 200;
  savedDirectory = "/tmp/a-different-workspace";
  requests.length = 0;
  events = await start();
  assert.equal(events.find(event => event.type === "session").externalId, "forked");
  assert.ok(requests.some(request => request.url?.startsWith("/session/saved/fork?directory=")));

  lookupStatus = 503;
  requests.length = 0;
  events = await start();
  assert.ok(events.some(event => event.type === "exit"));
  assert.equal(requests.some(request => request.method === "POST"), false);
});
