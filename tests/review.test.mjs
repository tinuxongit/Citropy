import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { store } from "../server/store.ts";
import { closeProject } from "../server/routes/projects.ts";
import { beginCheckpoint, finishCheckpoint, reviewChanges, reviewSummary, reviewFile } from "../server/checkpoints.ts";
import { changeHunk } from "../server/review.ts";
import { handleFeatures } from "../server/features.ts";
import { parseUnifiedDiff, summarizeUnifiedDiff } from "../shared/diff.ts";

async function fixture(t, files = { "first.txt": "before\n", "second.txt": "before\n" }) {
  const cwd = await mkdtemp(join(tmpdir(), "citropy-review-"));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 15000 });
  git("init", "-q");
  for (const [key, value] of Object.entries({ "user.name": "Review test", "user.email": "review@example.invalid", "commit.gpgSign": "false", "core.autocrlf": "false", "core.filemode": "false" })) git("config", "--local", key, value);
  for (const [path, text] of Object.entries(files)) await writeFile(join(cwd, path), text);
  git("add", "-A");
  git("commit", "-qm", "fixture");
  const project = store.openProject(cwd);
  const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: "Review test" });
  t.after(async () => { await closeProject(project.id); await rm(cwd, { recursive: true, force: true }); });
  return { cwd, git, thread };
}

async function request(threadId, query) {
  const url = new URL(`http://localhost:4000/api/threads/review?${new URLSearchParams({ threadId, ...query })}`);
  let status, value;
  const res = { writeHead(code) { status = code; return this; }, end(body) { value = body ? JSON.parse(body) : undefined; } };
  await handleFeatures({ method: "GET", url: url.pathname + url.search, headers: { host: "localhost:4000" } }, res, []);
  return { status, value };
}

test("review summaries omit patch bodies and selected retrieval retains whole-scope revision checks", async t => {
  const { cwd, thread } = await fixture(t);
  const content = Array.from({ length: 4500 }, (_, index) => `long changed line ${index}`).join("\n") + "\n";
  await writeFile(join(cwd, "first.txt"), content);
  await writeFile(join(cwd, "second.txt"), content);
  const full = await reviewChanges(thread, "unstaged");
  const summary = await reviewSummary(thread, "unstaged");
  assert.equal(summary.revision, full.revision);
  assert.deepEqual(summary.files, full.patches.map(({ path, added, removed }) => ({ path, added, removed })));
  assert.ok(!("patches" in summary));
  assert.ok(JSON.stringify(summary).length < JSON.stringify(full).length / 100);
  const selected = await reviewFile(thread, "unstaged", "first.txt", summary.revision);
  assert.deepEqual(selected, full.patches.find(patch => patch.path === "first.txt"));
  assert.equal(selected.truncated, true);
  assert.equal(selected.hunks.flatMap(hunk => hunk.lines).length, 4000);
  await writeFile(join(cwd, "second.txt"), "another edit\n");
  await assert.rejects(reviewFile(thread, "unstaged", "first.txt", summary.revision), /changes moved/);
  await assert.rejects(reviewFile(thread, "unstaged", "first.txt", "invalid"), /current review/);
});

test("review summary HTTP mode preserves the full endpoint and validates per-file requests", async t => {
  const { cwd, thread } = await fixture(t);
  await writeFile(join(cwd, "first.txt"), "after\n");
  const summary = await request(thread.id, { scope: "unstaged", summary: "1" });
  assert.equal(summary.status, 200);
  assert.deepEqual(summary.value.files, [{ path: "first.txt", added: 1, removed: 1 }]);
  assert.ok(!("patches" in summary.value));
  const full = await request(thread.id, { scope: "unstaged" });
  assert.equal(full.status, 200);
  assert.equal(full.value.patches.length, 1);
  const file = await request(thread.id, { scope: "unstaged", path: "first.txt", revision: summary.value.revision });
  assert.equal(file.status, 200);
  assert.deepEqual(file.value, full.value.patches[0]);
  for (const query of [{ path: "../outside" }, { path: "missing" }, { path: "first.txt", revision: "invalid" }, { scope: "unsupported" }]) {
    const result = await request(thread.id, { scope: "unstaged", revision: summary.value.revision, ...query });
    assert.equal(result.status, 400);
  }
  await writeFile(join(cwd, "first.txt"), "newer\n");
  assert.equal((await request(thread.id, { scope: "unstaged", path: "first.txt", revision: summary.value.revision })).status, 400);
});

test("checkpoint review file reads use the completed snapshot even after unrelated workspace edits", async t => {
  const { cwd, thread } = await fixture(t);
  await beginCheckpoint(thread, "first-turn");
  await writeFile(join(cwd, "first.txt"), "first-turn\n");
  await finishCheckpoint(thread);
  await beginCheckpoint(thread, "second-turn");
  await writeFile(join(cwd, "second.txt"), "second-turn\n");
  await finishCheckpoint(thread);
  const summary = await reviewSummary(thread, "lastTurn", "first-turn");
  assert.equal(summary.messageId, "first-turn");
  assert.deepEqual(summary.files, [{ path: "first.txt", added: 1, removed: 1 }]);
  await writeFile(join(cwd, "first.txt"), "late local edit\n");
  const patch = await reviewFile(thread, "lastTurn", "first.txt", summary.revision, "first-turn");
  assert.ok(patch.hunks[0].lines.some(line => line.text === "first-turn"));
  assert.ok(!patch.hunks[0].lines.some(line => line.text === "late local edit"));
  const task = await reviewSummary(thread, "task");
  assert.deepEqual(task.files.map(file => file.path), ["first.txt", "second.txt"]);
});

test("hunk changes retain stale-revision and active-workspace guards with summary revisions", async t => {
  const { cwd, git, thread } = await fixture(t);
  await writeFile(join(cwd, "first.txt"), "after\n");
  const summary = await reviewSummary(thread, "unstaged");
  await writeFile(join(cwd, "second.txt"), "unrelated\n");
  await assert.rejects(changeHunk(thread, { scope: "unstaged", path: "first.txt", index: 0, revision: summary.revision, operation: "stage" }), /changes moved/);
  assert.equal(git("diff", "--cached"), "");
  const current = await reviewSummary(thread, "unstaged");
  store.patchThread(thread.id, { running: true });
  await assert.rejects(changeHunk(thread, { scope: "unstaged", path: "first.txt", index: 0, revision: current.revision, operation: "stage" }), /Stop the agents/);
  store.patchThread(thread.id, { running: false });
  await changeHunk(thread, { scope: "unstaged", path: "first.txt", index: 0, revision: current.revision, operation: "stage" });
  assert.deepEqual(git("diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean), ["first.txt"]);
  const staged = await reviewSummary(thread, "staged");
  await changeHunk(thread, { scope: "staged", path: "first.txt", index: 0, revision: staged.revision, operation: "unstage" });
  assert.equal(git("diff", "--cached"), "");
  const unstaged = await reviewSummary(thread, "unstaged");
  await changeHunk(thread, { scope: "unstaged", path: "first.txt", index: 0, revision: unstaged.revision, operation: "revert" });
  assert.equal(await readFile(join(cwd, "first.txt"), "utf8"), "before\n");
  assert.equal(await readFile(join(cwd, "second.txt"), "utf8"), "unrelated\n");
});

test("summary parsing and exact file selection preserve quoted paths, metadata-only changes and plain multi-file diffs", () => {
  const raw = 'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"\n--- "a/caf\\303\\251.txt"\n+++ "b/caf\\303\\251.txt"\n@@ -1 +1 @@\n--- old\n+++ new\n' +
    'diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n' +
    'diff --git a/binary.bin b/binary.bin\nBinary files differ\n';
  const patches = parseUnifiedDiff(raw);
  assert.deepEqual(summarizeUnifiedDiff(raw), patches.map(({ path, added, removed }) => ({ path, added, removed })));
  for (const patch of patches) assert.deepEqual(parseUnifiedDiff(raw, "", patch.path), [patch]);
  const plain = '--- a/first.txt\n+++ b/first.txt\n@@ -1 +1 @@\n-old\n+new\n--- a/second.txt\n+++ b/second.txt\n@@ -0,0 +1 @@\n+created\n';
  assert.deepEqual(summarizeUnifiedDiff(plain), [{ path: "first.txt", added: 1, removed: 1 }, { path: "second.txt", added: 1, removed: 0 }]);
  assert.equal(parseUnifiedDiff(plain, "", "second.txt")[0].hunks[0].lines[0].text, "created");
});
