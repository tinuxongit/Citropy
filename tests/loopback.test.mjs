import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { test } from "node:test";
import { defaultPort, freePort, portAvailable } from "../shared/ports.mjs";
import { readRemoteHealth, REMOTE_PROTOCOL, REMOTE_TOKEN_HEADER } from "../shared/remote-connection.mjs";

const TOKEN = "t".repeat(64);
const ENVIRONMENT_ID = "11111111-1111-1111-1111-111111111111";
const SHORT_TIMEOUT_MS = 100;

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(resolve));
}

async function healthServer(t, respond) {
  const requests = [];
  const server = createHttpServer((req, res) => {
    requests.push(req);
    respond(req, res);
  });
  const port = await listen(server);
  t.after(() => close(server));
  return { port, requests };
}

function reply(status, body) {
  return (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
}

test("the wire contract keeps its literal header and protocol", () => {
  assert.equal(REMOTE_TOKEN_HEADER, "x-citropy-remote-token");
  assert.equal(REMOTE_PROTOCOL, 1);
});

test("default ports separate the regular and development servers", () => {
  assert.equal(defaultPort(false), 4177);
  assert.equal(defaultPort(true), 4178);
  assert.equal(defaultPort(), 4177);
});

test("freePort returns a port that can be bound", async () => {
  const port = await freePort();
  const server = createServer();
  assert.equal(await listen(server, port), port);
  await new Promise(resolve => server.close(resolve));
});

test("portAvailable reports whether a port is held", async () => {
  const holder = createServer();
  const port = await listen(holder);
  assert.equal(await portAvailable(port), false);
  await new Promise(resolve => holder.close(resolve));
  assert.equal(await portAvailable(port), true);
});

test("readRemoteHealth returns the health of the matching environment and sends the token", async t => {
  const body = { ok: true, environmentId: ENVIRONMENT_ID, build: "b".repeat(64), protocol: 1 };
  const { port, requests } = await healthServer(t, reply(200, body));
  assert.deepEqual(await readRemoteHealth({ port, token: TOKEN, environmentId: ENVIRONMENT_ID }), body);
  assert.equal(requests[0].url, "/api/health");
  assert.equal(requests[0].headers["x-citropy-remote-token"], TOKEN);
});

test("readRemoteHealth rejects a different environment", async t => {
  const { port } = await healthServer(t, reply(200, { environmentId: "22222222-2222-2222-2222-222222222222", protocol: 1 }));
  assert.equal(await readRemoteHealth({ port, token: TOKEN, environmentId: ENVIRONMENT_ID }), null);
});

test("readRemoteHealth rejects a different protocol", async t => {
  const { port } = await healthServer(t, reply(200, { environmentId: ENVIRONMENT_ID, protocol: 2 }));
  assert.equal(await readRemoteHealth({ port, token: TOKEN, environmentId: ENVIRONMENT_ID }), null);
});

test("readRemoteHealth returns null for a failing response", async t => {
  const { port } = await healthServer(t, reply(401, { environmentId: ENVIRONMENT_ID, protocol: 1 }));
  assert.equal(await readRemoteHealth({ port, token: TOKEN, environmentId: ENVIRONMENT_ID }), null);
});

test("readRemoteHealth returns null when the server does not answer in time", async t => {
  const { port } = await healthServer(t, () => {});
  assert.equal(await readRemoteHealth({ port, token: TOKEN, environmentId: ENVIRONMENT_ID, timeout: SHORT_TIMEOUT_MS }), null);
});

test("readRemoteHealth returns null when the caller aborts", async t => {
  const { port } = await healthServer(t, () => {});
  const controller = new AbortController();
  const pending = readRemoteHealth({ port, token: TOKEN, environmentId: ENVIRONMENT_ID, signal: controller.signal });
  controller.abort();
  assert.equal(await pending, null);
});
