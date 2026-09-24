import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

test("a thread you chat in moves above every other thread in its project", async (t) => {
  const directory = fs.mkdtempSync(join(os.tmpdir(), "citropy-raise-"));
  const originalHomedir = os.homedir;
  os.homedir = () => directory;
  syncBuiltinESMExports();
  const { store } = await import("../server/store.ts");
  t.after(async () => {
    store.flush();
    os.homedir = originalHomedir;
    syncBuiltinESMExports();
    await new Promise((resolve) => setTimeout(resolve, 450));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const project = store.openProject(directory);
  const create = (title) => store.createThread({ projectId: project.id, provider: "claude", title, permissionMode: "manual" });
  const [first, second, third] = [create("First"), create("Second"), create("Third")];
  [first, second, third].forEach((thread, index) => store.organizeThread(thread.id, { position: index }));

  store.raiseThread(third.id);
  store.raiseThread(second.id);

  const order = [first, second, third].sort((a, b) => a.position - b.position).map((thread) => thread.title);
  assert.deepEqual(order, ["Second", "Third", "First"]);
});
