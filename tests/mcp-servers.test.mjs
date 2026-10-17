import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { store } from "../server/store.ts";
import { answer, pendingRequests } from "../server/permissions.ts";
import {
  handleMcpSettings,
  hubInstructions,
  hubTools,
  callHubTool,
  stopMcpServers,
} from "../server/mcp/mcp-servers.ts";
import { readToml } from "../server/mcp/mcp-found.ts";

const fake = fileURLToPath(new URL("./fixtures/fake-mcp-server.mjs", import.meta.url));

async function connected(id) {
  for (let tries = 0; tries < 100; tries++) {
    const { servers } = await handleMcpSettings("GET", "", {});
    const server = servers.find((entry) => entry.id === id);
    if (server.status !== "starting") return server;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server didn't start");
}

test("servers added in settings reach agents through Citropy's tools", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-mcp-"));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "claude" });
  t.after(async () => {
    await stopMcpServers();
    store.removeThread(thread.id);
    store.projects.delete(project.id);
    await rm(directory, { recursive: true, force: true });
  });

  await assert.rejects(
    handleMcpSettings("POST", "", { servers: [{ name: "Bad", url: "file:///etc/passwd" }] }),
    /http or https/,
  );
  const added = await handleMcpSettings("POST", "", {
    servers: [
      {
        name: "Fake Notes",
        command: process.execPath,
        args: [fake],
        env: { FAKE_PREFIX: "notes:" },
      },
    ],
  });
  const { id } = added.servers[0];
  assert.equal("env" in added.servers[0], false);
  await assert.rejects(
    handleMcpSettings("POST", "", {
      servers: [{ name: "Again", command: process.execPath, args: [fake] }],
    }),
    /already added/,
  );

  const server = await connected(id);
  assert.equal(server.status, "connected", server.error);
  assert.deepEqual(
    server.tools.map((tool) => [tool.name, tool.access]),
    [
      ["read_notes", "allow"],
      ["add_note", "ask"],
    ],
  );
  assert.deepEqual(
    (await hubTools()).map((tool) => tool.name),
    ["fake-notes__read_notes", "fake-notes__add_note"],
  );
  assert.match(await hubInstructions(), /Keep notes short/);
  assert.equal(
    await callHubTool(thread.id, "browser_open", {}, new AbortController().signal),
    undefined,
  );

  const read = await callHubTool(
    thread.id,
    "fake-notes__read_notes",
    {},
    new AbortController().signal,
  );
  assert.deepEqual(read.content, [{ type: "text", text: "notes:" }]);

  store.patchThread(thread.id, { permissionMode: "manual" });
  const asked = callHubTool(
    thread.id,
    "fake-notes__add_note",
    { text: "hi" },
    new AbortController().signal,
  );
  let request;
  for (let tries = 0; !request && tries < 50; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    request = pendingRequests().find((entry) => entry.threadId === thread.id);
  }
  assert.equal(request.tool, "mcp__citropy__fake-notes__add_note");
  answer(request.id, "deny");
  await assert.rejects(asked, /Denied/);

  store.patchThread(thread.id, { permissionMode: "bypass" });
  const added2 = await callHubTool(
    thread.id,
    "fake-notes__add_note",
    { text: "hi" },
    new AbortController().signal,
  );
  assert.deepEqual(added2.content, [{ type: "text", text: "notes:hi" }]);

  await handleMcpSettings("PATCH", "tool", { id, tool: "add_note", access: "off" });
  assert.deepEqual(
    (await hubTools()).map((tool) => tool.name),
    ["fake-notes__read_notes"],
  );
  await assert.rejects(
    callHubTool(thread.id, "fake-notes__add_note", {}, new AbortController().signal),
    /turned off/,
  );

  await handleMcpSettings("PATCH", "server", { id, enabled: false });
  assert.deepEqual(await hubTools(), []);
  const removed = await handleMcpSettings("DELETE", "", { id });
  assert.deepEqual(removed.servers, []);
});

test("readToml reads Codex server tables", () => {
  assert.deepEqual(
    readToml(`
model = "gpt-5"
[mcp_servers.docs]
command = "npx"
args = ["-y", 'docs-mcp'] # trailing comment
env = { KEY = "a\\"b" }

[[profiles]]
name = "skip"

[mcp_servers."remote.one"]
url = "https://example.com/mcp"
enabled = false
`),
    {
      model: "gpt-5",
      mcp_servers: {
        docs: { command: "npx", args: ["-y", "docs-mcp"], env: { KEY: 'a"b' } },
        "remote.one": { url: "https://example.com/mcp", enabled: false },
      },
    },
  );
});
