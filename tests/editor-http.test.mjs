import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { store } from "../server/store.ts";
import { handleFeatures } from "../server/features.ts";
import { requestHandler } from "../server/http-handler.ts";

test("editor HTTP routes bind reads and saves to the requested worktree and reject foreign origins", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-editor-http-"));
  const root = join(directory, "root");
  const worktree = join(directory, "worktree");
  await mkdir(root);
  await mkdir(worktree);
  await writeFile(join(root, "code.ts"), "original");
  await writeFile(join(worktree, "code.ts"), "worktree");
  store.projects.set("editor-test", { id: "editor-test", path: root });
  store.threads.set("editor-thread", {
    id: "editor-thread",
    projectId: "editor-test",
    workspacePath: worktree,
  });
  const server = createServer(
    requestHandler(async (req, res) => {
      if (!(await handleFeatures(req, res, []))) res.writeHead(404).end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.projects.delete("editor-test");
    store.threads.delete("editor-thread");
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/editor/file?projectId=editor-test&threadId=editor-thread&path=code.ts`;
  const initial = await fetch(url);
  assert.equal(initial.status, 200);
  const file = await initial.json();
  assert.equal(file.text, "worktree");
  const text = "x".repeat(512 * 1024);
  const saved = await fetch(url, {
    method: "PUT",
    body: JSON.stringify({ text, revision: file.revision }),
  });
  assert.equal(saved.status, 200);
  assert.equal(await readFile(join(worktree, "code.ts"), "utf8"), text);
  assert.equal(await readFile(join(root, "code.ts"), "utf8"), "original");
  const stale = await fetch(url, {
    method: "PUT",
    body: JSON.stringify({ text: "stale", revision: file.revision }),
  });
  assert.equal(stale.status, 400);
  const foreign = await fetch(url, {
    method: "PUT",
    headers: { origin: "https://example.com" },
    body: "{}",
  });
  assert.equal(foreign.status, 403);
  assert.equal(
    (await fetch(url.replace("editor-thread", "missing-thread"))).status,
    400,
  );
  assert.equal(
    (await fetch(url.replace("code.ts", "..%2Foutside"))).status,
    400,
  );
});
