import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

test("chats stopped by a usage limit resume once the limit resets", async t => {
  const directory = fs.mkdtempSync(join(os.tmpdir(), "citropy-usage-resume-"));
  const originalHome = os.homedir;
  os.homedir = () => directory;
  syncBuiltinESMExports();
  const { store } = await import("../server/store.ts");
  const { providers } = await import("../server/providers/index.ts");
  const { runtimeFor, disposeAll } = await import("../server/runtime.ts");
  const { checkUsageResume, RESUME_PROMPT } = await import("../server/usage-resume.ts");
  const sessions = [];
  providers.pi.models = [{ id: "pi-model", label: "Pi model", isDefault: true, contextMax: 128000 }];
  providers.pi.start = options => {
    const session = { options, sent: [] };
    sessions.push(session);
    return { send(prompt) { session.sent.push(prompt); }, interrupt() {}, dispose() {} };
  };
  const until = async check => {
    for (let index = 0; index < 200 && !check(); index++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(check());
  };
  t.after(() => {
    disposeAll();
    store.flush();
    os.homedir = originalHome;
    syncBuiltinESMExports();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "pi", model: "pi-model", title: "Long task", permissionMode: "manual", workspacePath: directory });
  const limit = "You've hit your usage limit. Try again in 2 hours.";

  await runtimeFor(thread.id).send("Refactor the importer");
  sessions.at(-1).options.emit({ type: "turn.end", error: limit });
  await until(() => !store.threads.get(thread.id).running);
  const waiting = store.threads.get(thread.id).usageLimit;
  assert.equal(waiting.resume, false);
  assert.ok(Math.abs(waiting.resetsAt - (waiting.at + 2 * 3_600_000)) < 5);
  assert.equal(store.notifications[0].title, "Usage limit reached");

  store.patchThread(thread.id, { usageLimit: { ...waiting, resume: true } });
  checkUsageResume();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sessions.at(-1).sent.includes(RESUME_PROMPT), false, "Waits for the reset time");

  store.patchThread(thread.id, { usageLimit: { ...store.threads.get(thread.id).usageLimit, resetsAt: Date.now() - 60_000 } });
  checkUsageResume();
  await until(() => sessions.some(session => session.sent.some(prompt => prompt.includes(RESUME_PROMPT))));
  assert.equal(store.threads.get(thread.id).usageLimit, undefined);
  assert.equal(store.notifications[0].title, "Resuming after usage reset");

  sessions.at(-1).options.emit({ type: "turn.end", error: "Usage limit reached" });
  await until(() => !store.threads.get(thread.id).running);
  assert.equal(store.threads.get(thread.id).usageLimit.resume, true, "A resumed chat keeps waiting if the limit is hit again");
  assert.equal(store.threads.get(thread.id).usageLimit.resetsAt, undefined);

  await runtimeFor(thread.id).send("Actually, stop and summarize");
  assert.equal(store.threads.get(thread.id).usageLimit, undefined, "Sending a message clears the wait");
  sessions.at(-1).options.emit({ type: "turn.end", error: "The command failed with exit code 1" });
  await until(() => !store.threads.get(thread.id).running);
  assert.equal(store.threads.get(thread.id).usageLimit, undefined, "Ordinary errors do not wait for usage");

  store.configureResumeAfterLimits(true);
  await runtimeFor(thread.id).send("Try once more");
  sessions.at(-1).options.emit({ type: "turn.end", error: limit });
  await until(() => !store.threads.get(thread.id).running);
  assert.equal(store.threads.get(thread.id).usageLimit.resume, true, "The global setting turns resuming on for every chat");
  assert.equal(JSON.parse(fs.readFileSync(join(directory, ".citropy", "settings.json"), "utf8")).resumeAfterLimits, true);
});
