import assert from "node:assert/strict";
import { test } from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Git status skips unnecessary processes while preserving tracking and line counts", async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-git-status-"));
  const original = childProcess.execFile;
  const run = promisify(original);
  const commands = [];
  childProcess.execFile = () => { throw new Error("Expected asynchronous Git execution"); };
  childProcess.execFile[promisify.custom] = (command, args, options) => {
    commands.push(args);
    return run(command, args, options);
  };
  syncBuiltinESMExports();
  t.after(async () => {
    childProcess.execFile = original;
    syncBuiltinESMExports();
    await rm(directory, { recursive: true, force: true });
  });
  const git = (...args) => run("git", args, { cwd: directory });
  await git("init", "-q");
  await git("config", "user.name", "Performance test");
  await git("config", "user.email", "performance@example.invalid");
  await git("config", "commit.gpgSign", "false");
  await writeFile(join(directory, "tracked.txt"), "original\n");
  await git("add", ".");
  await git("commit", "-qm", "Initial");
  const { status } = await import("../server/git.ts");
  const clean = await status(directory);
  assert.equal(clean.clean, true);
  assert.equal(clean.upstream, null);
  assert.equal(clean.ahead, 0);
  assert.equal(clean.behind, 0);
  assert.deepEqual(commands.map(args => args[0]), ["status", "symbolic-ref", "rev-parse"]);

  commands.length = 0;
  await writeFile(join(directory, "untracked.txt"), "new\n");
  const untracked = await status(directory);
  assert.deepEqual(untracked.files.map(file => [file.path, file.untracked, file.added, file.removed]), [["untracked.txt", true, 0, 0]]);
  assert.equal(commands.some(args => args[0] === "diff"), false);

  await git("branch", "upstream");
  await git("branch", "--set-upstream-to=upstream");
  await git("commit", "--allow-empty", "-qm", "Ahead");
  await writeFile(join(directory, "tracked.txt"), "replacement\nextra\n");
  await git("add", "tracked.txt");
  await writeFile(join(directory, "tracked.txt"), "replacement\nextra\nunstaged\n");
  const dirty = await status(directory);
  const tracked = dirty.files.find(file => file.path === "tracked.txt");
  assert.equal(dirty.upstream, "upstream");
  assert.equal(dirty.ahead, 1);
  assert.equal(dirty.behind, 0);
  assert.equal(tracked.added, 3);
  assert.equal(tracked.removed, 1);
  assert.equal(tracked.staged, true);
});
