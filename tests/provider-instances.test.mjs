import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a named Pi account supplies discovery, thread creation, and launch configuration", async t => {
  const root = await mkdtemp(join(tmpdir(), "citropy-provider-instance-"));
  const old = { ...process.env };
  process.env.CITROPY_DATA_DIR = join(root, "data");
  const binary = join(root, "custom-pi");
  const log = join(root, "launch.jsonl");
  await writeFile(binary, `#!${process.execPath}
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { process.stdout.write("2.0.0\\n"); process.exit(0); }
appendFileSync(process.env.INSTANCE_LOG, JSON.stringify({ account: process.env.TEST_ACCOUNT, args: process.argv.slice(2) }) + "\\n");
let buffer = "";
const send = value => process.stdout.write(JSON.stringify(value) + "\\n");
process.stdin.on("data", chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const row = JSON.parse(buffer.slice(0, index));
    buffer = buffer.slice(index + 1);
    if (row.type === "get_state") send({ id: row.id, type: "response", success: true, data: { sessionId: "account-session", model: { provider: "test", id: "account", contextWindow: 8192 } } });
    if (row.type === "get_available_models") send({ id: row.id, type: "response", success: true, data: { models: [{ provider: "test", id: "account", name: "Account model", contextWindow: 8192 }] } });
    if (row.type === "prompt") {
      send({ id: row.id, type: "response", success: true });
      send({ type: "agent_start" });
      send({ type: "message_start", message: { role: "assistant" } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Account reply" } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_end", contentIndex: 0 } });
      send({ type: "message_end", message: { role: "assistant", responseId: "reply", usage: { input: 1, output: 2 } } });
      send({ type: "agent_settled" });
    }
  }
});
`, { mode: 0o755 });
  await chmod(binary, 0o755);
  const { store } = await import("../server/store.ts");
  const { refreshProvidersNow, providerInfo } = await import("../server/provider-registry.ts");
  const { threadRoutes } = await import("../server/routes/threads.ts");
  const { runtimeFor, disposeRuntime } = await import("../server/runtime.ts");
  t.after(async () => { for (const thread of store.threads.values()) disposeRuntime(thread.id); await new Promise(resolve => setTimeout(resolve, 100)); process.env = old; await rm(root, { recursive: true, force: true }); });
  store.assistance.automaticTitles = false;
  for (const id of ["claude", "codex", "opencode", "cursor"]) store.disabledProviders.add(id);
  const instance = store.saveProviderInstance({ provider: "pi", name: "Second account", binary, environment: { TEST_ACCOUNT: "second", INSTANCE_LOG: log } });
  store.setComputerEnabled(true);
  const settings = JSON.parse(await readFile(join(root, "data", "settings.json"), "utf8"));
  assert.equal(settings.providerInstances[0].id, instance.id);
  await refreshProvidersNow();
  const account = providerInfo().find(entry => entry.id === "pi").instances[0];
  assert.equal(account.available, true);
  assert.deepEqual(account.models.map(model => model.id), ["test/account"]);
  const project = store.openProject(root);
  await threadRoutes["thread.create"]({ t: "thread.create", projectId: project.id, provider: "pi", providerInstanceId: instance.id, model: "test/account" }, () => {});
  const thread = [...store.threads.values()].find(entry => entry.projectId === project.id);
  assert.equal(thread.providerInstanceId, instance.id);
  const codexAccount = store.saveProviderInstance({ provider: "codex", name: "Codex account", environment: {} });
  const codexInfo = providerInfo().find(entry => entry.id === "codex");
  codexInfo.enabled = true;
  codexInfo.instances = [{ id: codexAccount.id, name: codexAccount.name, available: true, models: [{ id: "account-model", label: "Account model" }] }];
  const blank = store.createThread({ projectId: project.id, provider: "pi", providerInstanceId: instance.id, title: "Blank", permissionMode: "manual" });
  await threadRoutes["thread.config"]({ t: "thread.config", id: blank.id, provider: "codex", providerInstanceId: codexAccount.id, model: "account-model" }, () => {});
  assert.equal(blank.provider, "codex");
  assert.equal(blank.providerInstanceId, codexAccount.id);
  const other = store.saveProviderInstance({ provider: "pi", name: "Third account", binary, environment: { TEST_ACCOUNT: "third", INSTANCE_LOG: log } });
  await refreshProvidersNow();
  await threadRoutes["thread.config"]({ t: "thread.config", id: thread.id, providerInstanceId: other.id }, () => {});
  assert.equal(thread.providerInstanceId, other.id);
  await assert.rejects(() => threadRoutes["thread.create"]({ t: "thread.create", projectId: project.id, provider: "pi", providerInstanceId: "missing" }, () => {}), /not available/);
  assert.throws(() => store.removeProviderInstance(other.id), /conversations and writing-model selections/);
  const launchCount = (await readFile(log, "utf8")).split("\n").filter(Boolean).length;
  await runtimeFor(thread.id).send("hello");
  for (let attempt = 0; attempt < 100 && (await readFile(log, "utf8").catch(() => "")).split("\n").filter(Boolean).length <= launchCount; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(JSON.parse((await readFile(log, "utf8")).split("\n").filter(Boolean).at(-1)).account, "third");
  for (let attempt = 0; attempt < 100 && (thread.status !== "idle" || !thread.messages.some(message => message.role === "assistant")); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(thread.status, "idle");
  assert.ok(thread.messages.some(message => message.role === "assistant"));
  const writer = join(root, "writing-pi");
  await writeFile(writer, `#!${process.execPath}
if (process.argv.includes("--version")) process.stdout.write("2.0.0\\n");
else process.stdout.write(JSON.stringify({ title: process.env.TEST_ACCOUNT, body: "" }) + "\\n");
`, { mode: 0o755 });
  await chmod(writer, 0o755);
  const writingAccount = store.saveProviderInstance({ provider: "pi", name: "Writing account", binary: writer, environment: { TEST_ACCOUNT: "writer" } });
  const { generateText } = await import("../server/text-generation.ts");
  assert.deepEqual(await generateText({ provider: "pi", model: "test/account", providerInstanceId: writingAccount.id }, "Summarize", []), { title: "writer", body: "" });
});
