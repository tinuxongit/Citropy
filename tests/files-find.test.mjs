import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { find } from "../server/files.ts";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("find walks nested folders and returns the largest matching files first", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-find-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "a", "b"), { recursive: true });
  await writeFile(join(directory, "small.txt"), "x");
  await writeFile(join(directory, "a", "medium.pdf"), "x".repeat(50));
  await writeFile(join(directory, "a", "b", "large.pdf"), "x".repeat(500));
  await symlink(directory, join(directory, "a", "loop"));
  const all = await find(directory, { path: "", sort: "size", limit: 2 });
  assert.deepEqual(all.files.map((file) => [file.path, file.size]), [[join(directory, "a", "b", "large.pdf"), 500], [join(directory, "a", "medium.pdf"), 50]]);
  assert.equal(all.complete, true);
  const pdfs = await find(directory, { path: "a", name: ".PDF", sort: "size", limit: 10 });
  assert.equal(pdfs.files.length, 2);
  await assert.rejects(find(directory, { path: "../", sort: "size", limit: 1 }), /inside this workspace/);
});
