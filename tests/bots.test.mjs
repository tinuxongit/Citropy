import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { botStore } from "../server/bots/bot-store.ts";
import { postFromUser } from "../server/bots/group-chat.ts";
import { groupStore } from "../server/bots/group-store.ts";
import { react } from "../server/bots/reactions.ts";
import { uid } from "../server/ids.ts";
import { callWorkspaceTool } from "../server/mcp-workspace.ts";
import { refreshProvidersNow } from "../server/provider-registry.ts";
import { providers } from "../server/providers/index.ts";
import { removeThread } from "../server/routes/threads.ts";
import { store } from "../server/store.ts";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-bots-"));
  const project = store.openProject(directory);
  const sessions = new Map();
  t.mock.method(providers.claude, "detect", async () => ({ available: true }));
  t.mock.method(providers.claude, "start", options => {
    const session = { emit: options.emit, sent: [], send(prompt) { this.sent.push(prompt); }, dispose() {} };
    sessions.set(options.threadId, session);
    return session;
  });
  const makeBot = profile => {
    const id = uid("bot");
    const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: profile.name, botId: id });
    return botStore.create(id, thread.id, profile);
  };
  const makeGroup = bots => {
    const id = uid("grp");
    const thread = store.createThread({ projectId: project.id, provider: "claude", permissionMode: "manual", title: "Group", groupId: id });
    return groupStore.create(id, thread.id, bots.map(bot => bot.id));
  };
  t.after(async () => {
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  return { makeBot, makeGroup, sessions };
}

async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for the bot.");
}

test("a bot hands a task to another bot with its profile and sender attached", async t => {
  const { makeBot, sessions } = await fixture(t);
  const scout = makeBot({ name: "Scout", title: "Research", description: "Always cite sources." });
  const writer = makeBot({ name: "Writer" });
  await callWorkspaceTool(scout.threadId, "run_tool", { name: "bots_message", arguments: { botId: writer.id, text: "Draft a summary of the findings." } });
  const prompt = sessions.get(writer.threadId).sent[0];
  assert.match(prompt, /You are Writer/);
  assert.match(prompt, /This message is from Scout/);
  assert.match(prompt, new RegExp(`botId ${scout.id}`));
  const message = store.threads.get(writer.threadId).messages.at(-1);
  assert.equal(message.parts[0].text, "Draft a summary of the findings.");
  assert.deepEqual(message.origin, { kind: "bot", threadId: scout.threadId, botId: scout.id, name: "Scout", depth: 1 });
});

test("bot handoffs stop after the chain limit", async t => {
  const { makeBot } = await fixture(t);
  const first = makeBot({ name: "First" });
  const second = makeBot({ name: "Second" });
  store.addMessage(first.threadId, { id: uid("msg"), role: "user", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "Reply" }], origin: { kind: "bot", threadId: second.threadId, botId: second.id, name: "Second", depth: 8 } });
  await assert.rejects(
    callWorkspaceTool(first.threadId, "run_tool", { name: "bots_message", arguments: { botId: second.id, text: "Again" } }),
    /reached 8 handoffs/,
  );
});

test("deleting a bot's conversation deletes the bot", async t => {
  const { makeBot } = await fixture(t);
  const bot = makeBot({ name: "Temporary" });
  await removeThread(bot.threadId);
  assert.equal(botStore.bots.has(bot.id), false);
});

test("renaming a bot renames its conversation and logs the change", async t => {
  const { makeBot } = await fixture(t);
  const bot = makeBot({ name: "Old" });
  botStore.update(bot.id, { name: "New" });
  const thread = store.threads.get(bot.threadId);
  assert.equal(thread.title, "New");
  assert.equal(thread.messages.at(-1).parts[0].text, "Renamed to New");
  assert.throws(() => botStore.update(bot.id, { name: " " }), /Name cannot be empty/);
});

test("a bot shows its latest reply as a preview once the turn ends", async t => {
  const { makeBot } = await fixture(t);
  const bot = makeBot({ name: "Writer" });
  store.patchThread(bot.threadId, { running: true });
  store.addMessage(bot.threadId, { id: uid("msg"), role: "assistant", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "  ## Draft\n- **Saved** to `draft.md`, see [notes](https://example.com).  " }] });
  assert.equal(botStore.get(bot.id).preview, undefined);
  store.patchThread(bot.threadId, { running: false });
  assert.equal(botStore.get(bot.id).preview, "Draft Saved to draft.md, see notes.");
  assert.equal(botStore.get(bot.id).unread, true);
  botStore.update(bot.id, { unread: false });
  store.addMessage(bot.threadId, { id: uid("msg"), role: "user", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "word ".repeat(80) }] });
  store.patchThread(bot.threadId, { running: true });
  store.patchThread(bot.threadId, { running: false });
  assert.equal(botStore.get(bot.id).unread, false);
  assert.match(botStore.get(bot.id).preview, /^word word .*word…$/);
});

function groupTexts(group) {
  return store.readMessages(group.threadId).map(message => `${message.origin?.name ?? message.role}: ${message.parts[0].text}`);
}

test("a group message goes to the mentioned bot and its reply is posted to the group", async t => {
  const { makeBot, makeGroup, sessions } = await fixture(t);
  const scout = makeBot({ name: "Scout" });
  const writer = makeBot({ name: "Launch Writer" });
  const group = makeGroup([scout, writer]);
  assert.equal(group.name, "Scout, Launch Writer");
  await postFromUser(group.threadId, "@LaunchWriter draft the post");
  assert.equal(sessions.has(scout.threadId), false);
  const session = sessions.get(writer.threadId);
  assert.match(session.sent[0], /in the group chat "Scout, Launch Writer"/);
  assert.match(session.sent[0], /addressed to you/);
  assert.deepEqual(groupStore.get(group.id).working, [writer.id]);
  store.patchThread(writer.threadId, { running: true });
  store.addMessage(writer.threadId, { id: uid("msg"), role: "assistant", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "Draft ready. @Scout check the facts." }] });
  store.patchThread(writer.threadId, { running: false, status: "idle" });
  await until(() => sessions.get(scout.threadId)?.sent.length === 1);
  assert.deepEqual(groupTexts(group), ["user: @LaunchWriter draft the post", "Launch Writer: Draft ready. @Scout check the facts."]);
  assert.ok(!botStore.get(writer.id).unread);
  assert.deepEqual(store.readMessages(group.threadId).map(message => message.mentions?.map(tag => tag.title)), [["Launch Writer"], ["Scout"]]);
  assert.deepEqual(groupStore.get(group.id).working, [scout.id]);
  assert.match(sessions.get(scout.threadId).sent[0], /from Launch Writer, another bot/);
  assert.equal(groupStore.get(group.id).preview, "Launch Writer: Draft ready. @Scout check the facts.");
  assert.equal(groupStore.get(group.id).unread, true);
});

test("an unaddressed group message reaches every member and PASS replies stay out of the group", async t => {
  const { makeBot, makeGroup, sessions } = await fixture(t);
  const first = makeBot({ name: "First" });
  const second = makeBot({ name: "Second" });
  const group = makeGroup([first, second]);
  await postFromUser(group.threadId, "Who owns the deploy?");
  assert.match(sessions.get(first.threadId).sent[0], /reply with exactly PASS/);
  assert.match(sessions.get(second.threadId).sent[0], /reply with exactly PASS/);
  store.patchThread(first.threadId, { running: true });
  store.addMessage(first.threadId, { id: uid("msg"), role: "assistant", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "PASS" }] });
  store.patchThread(first.threadId, { running: false, status: "idle" });
  assert.deepEqual(groupTexts(group), ["user: Who owns the deploy?"]);
  assert.deepEqual(groupStore.get(group.id).working, [second.id]);
});

test("groups hold two to six bots and drop deleted members", async t => {
  const { makeBot, makeGroup } = await fixture(t);
  const bots = Array.from({ length: 7 }, (_, index) => makeBot({ name: `Bot${index}` }));
  assert.throws(() => makeGroup(bots.slice(0, 1)), /2 to 6 bots/);
  assert.throws(() => makeGroup(bots), /2 to 6 bots/);
  const group = makeGroup(bots.slice(0, 3));
  await removeThread(bots[0].threadId);
  assert.deepEqual(groupStore.get(group.id).botIds, [bots[1].id, bots[2].id]);
  groupStore.update(group.id, { name: "Ops", botIds: [bots[1].id, bots[3].id] });
  assert.deepEqual(groupTexts(group).slice(-3), ["system: Renamed to Ops", "system: Added Bot3", "system: Removed Bot2"]);
});

test("a bot keeps its own memories and gets them in its next briefing", async t => {
  const { makeBot, sessions } = await fixture(t);
  const scout = makeBot({ name: "Scout" });
  const writer = makeBot({ name: "Writer" });
  const run = (name, args = {}) => callWorkspaceTool(writer.threadId, "run_tool", { name, arguments: args });
  await run("bots_memory_save", { text: "The user wants summaries under five lines." });
  const [saved] = botStore.get(writer.id).memory;
  await run("bots_memory_save", { id: saved.id, text: "The user wants summaries under three lines." });
  await run("bots_memory_save", { text: "Stale fact." });
  await run("bots_memory_remove", { id: botStore.get(writer.id).memory[1].id });
  assert.deepEqual(botStore.get(writer.id).memory.map(entry => entry.text), ["The user wants summaries under three lines."]);
  await callWorkspaceTool(scout.threadId, "run_tool", { name: "bots_message", arguments: { botId: writer.id, text: "Summarize the launch." } });
  assert.match(sessions.get(writer.threadId).sent[0], new RegExp(`\\[${saved.id}\\] The user wants summaries under three lines\\.`));
});

test("a bot creates a focused bot with its own provider settings", async t => {
  const { makeBot } = await fixture(t);
  for (const provider of Object.values(providers)) if (provider.id !== "claude") t.mock.method(provider, "detect", async () => ({ available: false }));
  t.mock.method(providers.claude, "listModels", async () => [{ id: "test-model", label: "Test model" }]);
  await refreshProvidersNow();
  const scout = makeBot({ name: "Scout" });
  const result = JSON.parse((await callWorkspaceTool(scout.threadId, "run_tool", { name: "bots_create", arguments: { name: "Tracker", title: "Release tracking", description: "Watch the release checklist." } }))[0].text);
  const tracker = botStore.get(result.id);
  assert.equal(tracker.description, "Watch the release checklist.");
  const thread = store.threads.get(tracker.threadId);
  assert.equal(thread.provider, "claude");
  assert.equal(thread.messages.at(-1).parts[0].text, "Created by Scout");
  store.patchThread(scout.threadId, { permissionMode: "plan" });
  await assert.rejects(callWorkspaceTool(scout.threadId, "run_tool", { name: "bots_create", arguments: { name: "Another" } }), /Plan only/);
});

test("reactions reach the bot that wrote the message on its next prompt", async t => {
  const { makeBot, makeGroup, sessions } = await fixture(t);
  const scout = makeBot({ name: "Scout" });
  const writer = makeBot({ name: "Writer" });
  const reply = store.addMessage(writer.threadId, { id: uid("msg"), role: "assistant", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "Draft is ready." }] });
  const ask = { id: uid("msg"), role: "user", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "Hi" }] };
  store.addMessage(writer.threadId, ask);
  assert.throws(() => react(writer.threadId, ask.id, "like", true), /only react to a bot's message/);
  assert.throws(() => react(writer.threadId, reply.id, "wave", true), /listed reactions/);
  react(writer.threadId, reply.id, "dislike", true);
  react(writer.threadId, reply.id, "dislike", false);
  react(writer.threadId, reply.id, "like", true);
  assert.deepEqual(store.readMessages(writer.threadId).find(message => message.id === reply.id).reactions.map(entry => entry.key), ["like"]);
  const group = makeGroup([scout, writer]);
  const post = store.addMessage(group.threadId, { id: uid("msg"), role: "assistant", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "Shipped." }], origin: { kind: "bot", threadId: writer.threadId, botId: writer.id, name: "Writer", depth: 1 } });
  react(group.threadId, post.id, "love", true);
  await callWorkspaceTool(scout.threadId, "run_tool", { name: "bots_message", arguments: { botId: writer.id, text: "Next task." } });
  const first = sessions.get(writer.threadId).sent[0];
  assert.match(first, /reacted with thumbs up to your message: "Draft is ready\."/);
  assert.match(first, /reacted with heart to your message in the group chat "Scout, Writer": "Shipped\."/);
  assert.doesNotMatch(first, /thumbs down/);
  sessions.get(writer.threadId).emit({ type: "turn.end" });
  await until(() => !store.threads.get(writer.threadId).running);
  await callWorkspaceTool(scout.threadId, "run_tool", { name: "bots_message", arguments: { botId: writer.id, text: "Another task." } });
  assert.doesNotMatch(sessions.get(writer.threadId).sent[1], /reacted/);
});
