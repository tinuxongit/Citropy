import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import {
  createEditorFile,
  readEditorFile,
  saveEditorFile,
} from "../server/editor.ts";

async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), "citropy-editor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(join(root, "code.ts"), "const n = 1;\r\n", {
    mode: 0o755,
  });
  return root;
}

test("editor saves exact UTF-8 content atomically and preserves permissions", async (t) => {
  const root = await fixture(t);
  const file = await readEditorFile(root, "code.ts");
  assert.equal(file.text, "const n = 1;\r\n");
  const text = "\ufeffconst emoji = '🍋';\r\n";
  const saved = await saveEditorFile(root, "code.ts", text, file.revision);
  assert.equal((await readEditorFile(root, "code.ts")).text, text);
  assert.notEqual(saved.revision, file.revision);
  assert.equal((await fs.stat(join(root, "code.ts"))).mode & 0o777, 0o755);
  assert.deepEqual(await fs.readdir(root), ["code.ts"]);
});

test("stale and concurrent saves cannot overwrite a newer revision", async (t) => {
  const root = await fixture(t);
  const file = await readEditorFile(root, "code.ts");
  const results = await Promise.allSettled([
    saveEditorFile(root, "code.ts", "first", file.revision),
    saveEditorFile(root, "code.ts", "second", file.revision),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const current = await fs.readFile(join(root, "code.ts"), "utf8");
  await assert.rejects(
    saveEditorFile(root, "code.ts", "stale", file.revision),
    /changed on disk/,
  );
  assert.equal(await fs.readFile(join(root, "code.ts"), "utf8"), current);
});

test("editor refuses traversal, symlinks, binary, invalid UTF-8, directories and oversized input", async (t) => {
  const root = await fixture(t);
  await fs.symlink(join(root, "code.ts"), join(root, "link.ts"));
  await fs.writeFile(join(root, "binary"), Buffer.from([0, 1, 2]));
  await fs.writeFile(join(root, "invalid"), Buffer.from([0xff]));
  await fs.writeFile(join(root, "large"), "a".repeat(2 * 1024 * 1024 + 1));
  for (const path of [
    "../outside",
    "link.ts",
    "binary",
    "invalid",
    "large",
    ".",
  ])
    await assert.rejects(readEditorFile(root, path));
  const file = await readEditorFile(root, "code.ts");
  await assert.rejects(
    saveEditorFile(
      root,
      "code.ts",
      "a".repeat(2 * 1024 * 1024 + 1),
      file.revision,
    ),
    /2 MB/,
  );
  await assert.rejects(saveEditorFile(root, "link.ts", "bad", file.revision));
});

test("failed replacement leaves the original intact and removes temporary files", async (t) => {
  const root = await fixture(t);
  const file = await readEditorFile(root, "code.ts");
  const original = fs.rename;
  fs.rename = async () => {
    throw new Error("replacement failed");
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      saveEditorFile(root, "code.ts", "replacement", file.revision),
      /replacement failed/,
    );
  } finally {
    fs.rename = original;
    syncBuiltinESMExports();
  }
  assert.equal(await fs.readFile(join(root, "code.ts"), "utf8"), file.text);
  assert.deepEqual(await fs.readdir(root), ["code.ts"]);
});

test("reads reject a substituted descriptor", async (t) => {
  const root = await fixture(t);
  await fs.writeFile(join(root, "private"), "private");
  const original = fs.open;
  fs.open = async (path, ...args) =>
    original(
      path === join(root, "code.ts") ? join(root, "private") : path,
      ...args,
    );
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      readEditorFile(root, "code.ts"),
      /changed while opening/,
    );
  } finally {
    fs.open = original;
    syncBuiltinESMExports();
  }
});

test("new files are created exclusively inside existing workspace folders", async (t) => {
  const root = await fixture(t);
  const created = await createEditorFile(root, "new.ts");
  assert.equal(created.text, "");
  assert.equal(await fs.readFile(join(root, "new.ts"), "utf8"), "");
  await assert.rejects(createEditorFile(root, "code.ts"));
  assert.equal(
    await fs.readFile(join(root, "code.ts"), "utf8"),
    "const n = 1;\r\n",
  );
  await assert.rejects(createEditorFile(root, "../outside.ts"));
  await assert.rejects(createEditorFile(root, "missing/new.ts"));
});
