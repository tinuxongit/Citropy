import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseAuthorizationUrl } from "../server/providers/antigravity/acp.ts";
import { antigravityPaths } from "../server/providers/antigravity/paths.ts";
import { antigravityProfile, hasSignIn, launchEnvironment } from "../server/providers/antigravity/profile.ts";
import { accountModels, agentModel, currentModel, modelOptions } from "../server/providers/antigravity/models.ts";
import { modeTarget } from "../server/providers/antigravity/modes.ts";
import { describeTool, toolResult } from "../server/providers/antigravity/tools.ts";
import { cancelSignIn, completeSignIn, signInFlow, startSignIn } from "../server/providers/antigravity/sign-in.ts";
import { signOut } from "../server/providers/antigravity/accounts.ts";
import { AntigravitySession } from "../server/providers/antigravity/session.ts";
import { generateAntigravityText } from "../server/providers/antigravity/text.ts";
import { answer, pendingRequests } from "../server/permissions.ts";
import { store } from "../server/store.ts";

const fakeAgent = fileURLToPath(new URL("./fixtures/fake-antigravity.mjs", import.meta.url));
const redirect = "http://127.0.0.1:43123/";
const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=abc&redirect_uri=${encodeURIComponent(redirect)}`;
const modes = { currentModeId: "default", availableModes: ["default", "auto_edit", "yolo"].map(id => ({ id, name: id })) };
const models = [{ id: "model", name: "Model", type: "select", currentValue: "pro-agent", options: [{ group: "g", name: "G", options: [
  { value: "pro-agent", name: "Pro 2 (High)", description: "pro-agent" },
  { value: "pro-medium", name: "Pro 2 (Medium)" },
  { value: "pro-low", name: "Pro 2 (Low)" },
  { value: "flash", name: "Flash (Preview)", description: "Fast" },
] }] }];

async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for the fake Antigravity agent.");
}

async function install() {
  await chmod(fakeAgent, 0o755);
  await mkdir(join(antigravityPaths.installRecord, ".."), { recursive: true });
  await writeFile(antigravityPaths.installRecord, JSON.stringify({ version: "test", sha256: "", executable: fakeAgent, harness: fakeAgent }));
}

test("parseAuthorizationUrl accepts Google links with a loopback redirect only", () => {
  assert.deepEqual(parseAuthorizationUrl(googleUrl), { url: googleUrl, redirectUri: redirect, state: "abc" });
  for (const url of [
    googleUrl.replace("accounts.google.com", "example.com"),
    googleUrl.replace(encodeURIComponent(redirect), encodeURIComponent("http://evil.test:43123/")),
    googleUrl.replace("43123", "80"),
    `${googleUrl}&state=again`,
    `${googleUrl} extra`,
  ]) assert.throws(() => parseAuthorizationUrl(url), /invalid Google sign-in link/);
});

test("launchEnvironment drops inherited Google credentials and isolates the profile", t => {
  process.env.GEMINI_API_KEY = "secret";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/key.json";
  t.after(() => { delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_APPLICATION_CREDENTIALS; });
  const profile = antigravityProfile("work");
  const environment = launchEnvironment({ harness: "/harness" }, profile, "/tmp/run", { GOOGLE_API_KEY: "account-secret", KEEP: "yes" });
  assert.equal(environment.GEMINI_API_KEY, undefined);
  assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(environment.GOOGLE_API_KEY, undefined);
  assert.equal(environment.KEEP, "yes");
  assert.equal(environment.GEMINI_HOME, profile.home);
  assert.throws(() => antigravityProfile("../escape"), /invalid id/);
});

test("modelOptions joins effort levels of one model and maps choices back to Antigravity", () => {
  assert.deepEqual(modelOptions(models), [
    { id: "pro-2", label: "Pro 2", efforts: ["low", "medium", "high"], aliases: ["pro-agent", "pro-medium", "pro-low"], isDefault: true, defaultEffort: "high" },
    { id: "flash", label: "Flash (Preview)", hint: "Fast" },
  ]);
  assert.equal(agentModel(models, "pro-2", "medium"), "pro-medium");
  assert.equal(agentModel(models, "pro-2", undefined), "pro-agent");
  assert.equal(agentModel(models, "pro-low", undefined), "pro-agent");
  assert.equal(agentModel(models, "flash", "high"), "flash");
  assert.throws(() => agentModel(models, "ultra", "high"), /does not offer the model ultra/);
  assert.deepEqual(currentModel(models), { model: "pro-2", effort: "high" });
  assert.throws(() => modelOptions([]), /did not report its models/);
});

test("modeTarget maps permission modes and falls back to read-only planning", () => {
  assert.deepEqual(modeTarget("acceptEdits", modes, []), { kind: "mode", modeId: "auto_edit", readOnly: false });
  assert.deepEqual(modeTarget("plan", modes, []), { kind: "mode", modeId: "default", readOnly: true });
  assert.deepEqual(modeTarget("plan", { ...modes, availableModes: [...modes.availableModes, { id: "plan", name: "Plan" }] }, []), { kind: "mode", modeId: "plan", readOnly: false });
  const option = { id: "collab", name: "Mode", type: "select", category: "mode", currentValue: "default", options: [{ value: "architect", name: "Architect" }] };
  assert.deepEqual(modeTarget("plan", modes, [option]), { kind: "option", configId: "collab", value: "architect" });
  assert.throws(() => modeTarget("bypass", { ...modes, availableModes: [] }, []), /does not offer the yolo mode/);
});

test("describeTool and toolResult map Antigravity tools to Citropy tools", () => {
  assert.deepEqual(describeTool({ toolCallId: "1", kind: "execute", title: "Run", rawInput: { CommandLine: "ls", Cwd: "/p" } }), { name: "Bash", input: { command: "ls", cwd: "/p" } });
  assert.equal(describeTool({ toolCallId: "2", kind: "edit", content: [{ type: "diff", path: "/a", newText: "x" }] }).name, "Write");
  assert.equal(describeTool({ toolCallId: "3", kind: "edit", content: [{ type: "diff", path: "/a", oldText: "y", newText: "x" }] }).name, "Edit");
  assert.equal(describeTool({ toolCallId: "4", title: "start_subagent", rawInput: { task: "Look" } }).name, "Task");
  assert.deepEqual(toolResult({ toolCallId: "1", status: "completed", rawOutput: { combinedOutput: "out", exitCode: 2 } }), { text: "out", images: [], ok: false });
});

test("signing in with a pasted address, chatting, writing text, and signing out", async t => {
  await install();
  const launch = { instanceId: "work" };
  const profile = antigravityProfile("work");
  const directory = await mkdtemp(join(tmpdir(), "citropy-antigravity-"));
  const project = store.openProject(directory);
  const thread = store.createThread({ projectId: project.id, provider: "antigravity", permissionMode: "manual", title: "Antigravity test" });
  t.after(async () => {
    cancelSignIn(launch);
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });

  let signedIn = false;
  startSignIn(launch, () => { signedIn = true; });
  const flow = await until(() => signInFlow(launch)?.status === "waiting" && signInFlow(launch));
  const authorization = parseAuthorizationUrl(flow.url);
  await assert.rejects(completeSignIn(launch, `${authorization.redirectUri}?state=wrong&code=c`), /different sign-in/);
  await completeSignIn(launch, `${authorization.redirectUri}?state=${authorization.state}&code=c`);
  await until(() => signedIn);
  assert.equal(signInFlow(launch), undefined);
  assert.equal(await hasSignIn(profile), true);
  assert.deepEqual((await accountModels(launch)).map(model => model.id), ["gemini-pro", "gemini-flash"]);

  const events = [];
  const session = new AntigravitySession({ ...launch, threadId: thread.id, cwd: directory, model: "gemini-pro", effort: "low", permissionMode: "manual", emit: event => events.push(event) });
  t.after(() => session.dispose());
  session.send("List the files");
  const request = await until(() => pendingRequests().find(entry => entry.threadId === thread.id));
  assert.equal(request.tool, "Bash");
  assert.deepEqual(request.input, { command: "ls", cwd: undefined });
  answer(request.id, "allow_always");
  await until(() => events.some(event => event.type === "turn.end"));
  assert.deepEqual(events.find(event => event.type === "session"), { type: "session", externalId: "fake-session", model: "gemini-pro", effort: "low" });
  assert.deepEqual(events.find(event => event.type === "tool.end"), { type: "tool.end", callId: "tool-1", ok: true, output: "a.txt" });
  const text = events.filter(event => event.type === "block.delta").map(event => event.text);
  assert.deepEqual(text, ["Listing files", "Permission yes"]);
  assert.equal(events.find(event => event.type === "turn.end").error, undefined);
  assert.deepEqual(events.findLast(event => event.type === "usage").usage, { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });

  const raw = await generateAntigravityText(directory, "gemini-flash", undefined, "Summarize. Return only JSON", new AbortController().signal, launch);
  assert.deepEqual(JSON.parse(raw), { title: "Title from gemini-flash in plan", body: "Body" });

  await signOut(launch);
  assert.equal(await hasSignIn(profile), false);
  await assert.rejects(stat(profile.modelsPath), { code: "ENOENT" });
  await assert.rejects(accountModels(launch), /Sign in to Antigravity/);
});
