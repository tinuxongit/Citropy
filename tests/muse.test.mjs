import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { approvalChoice, approvalTool, autoApproved } from "../server/providers/muse/approvals.ts";
import { listMuseModels } from "../server/providers/muse/models.ts";
import { museAnswers, userQuestions } from "../server/providers/muse/questions.ts";
import { MuseSession } from "../server/providers/muse/session.ts";
import { museSignedIn } from "../server/providers/muse/sign-in.ts";
import { listMuseCommands, skillPart } from "../server/providers/muse/skills.ts";
import { generateMuseText } from "../server/providers/muse/text.ts";
import { itemOk, itemOutput, museTool } from "../server/providers/muse/tools.ts";
import { isMuseLauncher } from "../server/providers/muse/update.ts";
import { quotaMessage, readMuseUsage } from "../server/providers/muse/limits.ts";
import { comparableMuseVersion, museVersion } from "../server/providers/muse/version.ts";
import { answer, pendingRequests } from "../server/permissions.ts";
import { store } from "../server/store.ts";

const fakeMuse = fileURLToPath(new URL("./fixtures/fake-muse.mjs", import.meta.url));
const launch = { binary: fakeMuse, instanceId: "muse-test" };

async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for the fake Muse Code host.");
}

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-muse-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function chat(t, directory, permissionMode = "manual") {
  const project = store.openProject(directory);
  const thread = store.createThread({
    projectId: project.id,
    provider: "muse",
    permissionMode,
    title: "Muse test",
  });
  const events = [];
  const session = new MuseSession({
    ...launch,
    threadId: thread.id,
    cwd: directory,
    model: "default",
    permissionMode,
    emit: (event) => events.push(event),
  });
  t.after(() => {
    session.dispose();
    store.closeProject(project.id);
  });
  return { thread, session, events };
}

test.before(() => chmod(fakeMuse, 0o755));

test("museVersion reads the release and compares revisions as semver", () => {
  assert.equal(museVersion("Muse Code 1.4.6 (1.4.6-R6000.1)"), "1.4.6-R6000.1");
  assert.equal(museVersion("muse: command not found"), undefined);
  assert.equal(comparableMuseVersion("1.4.6-R6000.1"), "1.4.6-release.6000.1");
  assert.equal(comparableMuseVersion("1.4.6-R6000"), "1.4.6-release.6000.0");
});

test("museTool maps Muse items to Citropy tools", () => {
  assert.deepEqual(
    museTool({
      kind: "toolCall",
      tool: "shell",
      args: JSON.stringify({ cmd: ["ls", "-a"], workdir: "/p" }),
    }).input,
    { cmd: ["ls", "-a"], workdir: "/p", command: "ls -a", cwd: "/p" },
  );
  assert.equal(museTool({ kind: "toolCall", tool: "edit_file", args: '{"path":' }).name, "Edit");
  assert.deepEqual(museTool({ kind: "toolCall", tool: "edit_file", args: '{"path":' }).input, {
    arguments: '{"path":',
  });
  assert.deepEqual(museTool({ kind: "userShell", commandText: "pwd" }), {
    name: "Bash",
    input: { command: "pwd" },
  });
  assert.equal(itemOk({ kind: "toolCall", status: "completed", exitCode: 1 }), false);
  assert.equal(
    itemOutput({
      kind: "toolCall",
      status: "failed",
      failureReason: "Denied",
      visibleOutput: "partial",
    }),
    "Denied\npartial",
  );
});

test("approvals pick the narrowest matching choice and auto-approve only known edit subjects", () => {
  const choices = [
    {
      choiceId: "always",
      decision: "approvedPolicyAmendment",
      label: "Always",
      scope: "localPersistent",
    },
    {
      choiceId: "rule",
      decision: "approvedPolicyAmendment",
      label: "Session rule",
      scope: "session",
    },
    { choiceId: "once", decision: "approved", label: "Allow", scope: "once" },
    { choiceId: "abort", decision: "abort", label: "Stop", scope: "once" },
  ];
  assert.equal(approvalChoice(choices, "allow").choiceId, "once");
  assert.equal(approvalChoice(choices, "allow_always").choiceId, "rule");
  assert.equal(approvalChoice(choices, "deny").choiceId, "abort");
  assert.throws(() => approvalChoice(choices.slice(0, 2), "deny"), /no way to deny/);
  const write = {
    toolName: "write_file",
    rawArgs: JSON.stringify({ path: "/a" }),
    protectedWrite: false,
    subject: { kind: "fileAccess", path: "/b" },
  };
  assert.deepEqual(approvalTool(write), { name: "Write", input: { path: "/a", file_path: "/b" } });
  assert.equal(autoApproved("acceptEdits", write), true);
  assert.equal(autoApproved("manual", write), false);
  assert.equal(autoApproved("acceptEdits", { ...write, protectedWrite: true }), false);
  assert.equal(
    autoApproved("acceptEdits", { ...write, subject: { kind: "futureKind", path: "/b" } }),
    false,
  );
});

test("questions map both ways and keep typed answers as free text", () => {
  const questions = [
    {
      id: "color",
      question: "Color?",
      options: [{ label: "Red" }, { label: "Blue", description: "Calm" }],
      selection: { mode: "single" },
    },
    {
      id: "sizes",
      header: "Sizes",
      question: "Sizes?",
      options: [{ label: "S" }, { label: "M" }],
      selection: { mode: "multiple" },
    },
  ];
  assert.deepEqual(userQuestions(questions)[0], {
    id: "color",
    question: "Color?",
    options: [{ label: "Red" }, { label: "Blue", description: "Calm" }],
    multiple: false,
  });
  assert.deepEqual(museAnswers(questions, { color: ["Green"], sizes: ["S", "M", "and XL"] }), [
    { questionId: "color", freeText: "Green" },
    { questionId: "sizes", selectedLabels: ["S", "M"], note: "and XL" },
  ]);
  assert.throws(() => museAnswers(questions, { color: ["x".repeat(501)] }), /at most 500/);
});

test("skillPart only sends known skills as skill input", () => {
  const known = new Set(["review"]);
  assert.deepEqual(skillPart("/review  the parser ", known), {
    type: "skill",
    selector: "review",
    arguments: "the parser",
  });
  assert.deepEqual(skillPart("/review", known), { type: "skill", selector: "review" });
  assert.equal(skillPart("/unknown now", known), undefined);
  assert.equal(skillPart("please /review", known), undefined);
});

test("quotaMessage rounds the wait up to whole minutes", () => {
  assert.equal(
    quotaMessage({ limitKind: "window", resetsAtMs: 150_000 }, 0),
    "Muse Code reached its usage limit. Try again in 3 minutes.",
  );
  assert.equal(
    quotaMessage({ limitKind: "window", resetsAtMs: 0 }, 10_000),
    "Muse Code reached its usage limit. Try again in 1 minutes.",
  );
});

test("museSignedIn reads the Meta entry in the account's auth file", async (t) => {
  const home = await temporary(t);
  const account = { environment: { XDG_CONFIG_HOME: home } };
  assert.equal(await museSignedIn(account), false);
  await mkdir(join(home, "muse"));
  await writeFile(
    join(home, "muse", "auth.json"),
    JSON.stringify({ schema_version: 1, providers: {} }),
  );
  assert.equal(await museSignedIn(account), false);
  await writeFile(
    join(home, "muse", "auth.json"),
    JSON.stringify({ schema_version: 1, providers: { meta: { kind: "oauth" } } }),
  );
  assert.equal(await museSignedIn(account), true);
  assert.equal(
    await museSignedIn({
      environment: { XDG_CONFIG_HOME: join(home, "empty"), META_API_KEY: "key" },
    }),
    true,
  );
});

test("isMuseLauncher recognises Meta's launcher script only", async (t) => {
  const directory = await temporary(t);
  const launcher = join(directory, "muse");
  await writeFile(launcher, "#!/usr/bin/env bash\nUSER_AGENT=muse-code/launcher-3\n");
  assert.equal(await isMuseLauncher(launcher), true);
  assert.equal(await isMuseLauncher(fakeMuse), false);
  assert.equal(await isMuseLauncher(join(directory, "missing")), false);
});

test("models, skills, usage and text come from the Muse host", async (t) => {
  const directory = await temporary(t);
  assert.deepEqual(await listMuseModels(launch), [
    {
      id: "muse-large",
      label: "Muse Large",
      efforts: ["low", "high"],
      defaultEffort: "high",
      isDefault: true,
      contextMax: 200_000,
    },
    {
      id: "muse-small",
      label: "Muse Small",
      hint: "Fast",
      efforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
    },
  ]);
  assert.deepEqual(await listMuseCommands(directory, launch), [
    { name: "review", description: "Review the changes", argumentHint: "[focus]" },
  ]);
  assert.equal((await readMuseUsage(launch)).tier, "Pro");
  const raw = await generateMuseText(
    directory,
    "muse-small",
    "low",
    "Summarize. Return only JSON",
    new AbortController().signal,
    launch,
  );
  assert.deepEqual(JSON.parse(raw), { title: "Title from muse-small", body: "Body" });
});

test("a chat approves each command stage, streams the reply, counts tokens and records limits", async (t) => {
  const directory = await temporary(t);
  const { thread, session, events } = chat(t, directory);
  session.send("List the files");
  const request = await until(() =>
    pendingRequests().find((entry) => entry.threadId === thread.id),
  );
  assert.equal(request.tool, "Bash");
  assert.equal(request.input.command, "ls | wc -l");
  answer(request.id, "allow_always");
  await until(() => events.some((event) => event.type === "turn.end"));
  assert.equal(
    pendingRequests().some((entry) => entry.threadId === thread.id),
    false,
  );
  const started = events.find((event) => event.type === "session");
  assert.equal(started.model, "muse-large");
  assert.deepEqual(
    events.find((event) => event.type === "title"),
    { type: "title", title: "Fake session" },
  );
  assert.deepEqual(
    events.find((event) => event.type === "tool.end"),
    { type: "tool.end", callId: "tool-1", ok: true, output: "a.txt" },
  );
  assert.deepEqual(
    events.filter((event) => event.type === "block.delta").map((event) => event.text),
    ["Listed after session, once"],
  );
  assert.equal(events.find((event) => event.type === "turn.end").error, undefined);
  assert.deepEqual(events.findLast((event) => event.type === "usage").usage, {
    input: 10,
    output: 5,
    cacheRead: 2,
    cacheWrite: 0,
  });

  session.send("/review the parser");
  await until(() => events.filter((event) => event.type === "turn.end").length === 2);
  assert.equal(
    events.findLast((event) => event.type === "block.delta").text,
    "Skill review the parser",
  );

  session.send("Hello");
  await until(() => events.filter((event) => event.type === "turn.end").length === 3);
  assert.equal(events.findLast((event) => event.type === "block.delta").text, "Echo Hello");
  assert.equal((await readMuseUsage(launch)).window.usedPercent, 40);

  session.send("Hit the limit");
  await until(() => events.filter((event) => event.type === "turn.end").length === 4);
  assert.match(
    events.findLast((event) => event.type === "turn.end").error,
    /^Muse Code reached its usage limit\. Try again in 2 minutes\.$/,
  );
});

test("an approval Muse Code resolves on its own closes Citropy's prompt", async (t) => {
  const directory = await temporary(t);
  const { thread, session, events } = chat(t, directory);
  session.send("Remove the file");
  await until(() => pendingRequests().find((entry) => entry.threadId === thread.id));
  await session.steer("Go ahead");
  await until(() => events.some((event) => event.type === "turn.end"));
  assert.equal(
    pendingRequests().some((entry) => entry.threadId === thread.id),
    false,
  );
  assert.equal(events.findLast((event) => event.type === "block.delta").text, "Removed by policy");
  assert.equal(
    events.some((event) => event.type === "exit"),
    false,
  );
});

test("background shells outlive the turn and stop on request", async (t) => {
  const directory = await temporary(t);
  const { session, events } = chat(t, directory, "bypass");
  session.send("Start the background server");
  await until(() => events.some((event) => event.type === "turn.end"));
  assert.deepEqual(
    events.find((event) => event.type === "shell.background"),
    { type: "shell.background", callId: "shell-1", taskId: "shell-1", command: "npm run dev" },
  );
  assert.deepEqual(
    events.find((event) => event.type === "tool.output"),
    { type: "tool.output", callId: "shell-1", output: "ready", append: true },
  );
  assert.equal(
    events.some((event) => event.type === "shell.end"),
    false,
  );
  await session.stopShell("shell-1");
  const ended = await until(() => events.find((event) => event.type === "shell.end"));
  assert.deepEqual(ended, {
    type: "shell.end",
    callId: "shell-1",
    ok: false,
    stopped: true,
    output: "Muse Code reported cancelled.\nready",
  });
});
