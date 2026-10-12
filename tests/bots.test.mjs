import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { botStore } from "../server/bots/bot-store.ts";
import { postFromUser } from "../server/bots/group-chat.ts";
import { groupStore } from "../server/bots/group-store.ts";
import { checkRoutines, runRoutine } from "../server/bots/routines.ts";
import { uid } from "../server/ids.ts";
import { callWorkspaceTool } from "../server/mcp-workspace.ts";
import { providers } from "../server/providers/index.ts";
import { removeThread } from "../server/routes/threads.ts";
import { store } from "../server/store.ts";
import { describeSchedule, nextRunAfter } from "../shared/bots.ts";

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

test("routines reject schedules under five minutes and record finished runs", async t => {
  const { makeBot, sessions } = await fixture(t);
  const bot = makeBot({ name: "Daily" });
  assert.throws(() => botStore.saveRoutine(bot.id, { name: "Too often", prompt: "Check", schedule: { kind: "interval", minutes: 4 }, paused: false }), /every 5 minutes/);
  const routine = botStore.saveRoutine(bot.id, { name: "Inbox", prompt: "Summarize new mail.", schedule: { kind: "interval", minutes: 30 }, paused: false });
  assert.equal(store.threads.get(bot.threadId).messages.at(-1).parts[0].text, "Created routine Inbox");
  await runRoutine(bot.id, routine.id, true);
  const session = sessions.get(bot.threadId);
  assert.match(session.sent[0], /Your routine "Inbox" is running/);
  assert.equal(botStore.routine(bot.id, routine.id).runs[0].status, "running");
  await assert.rejects(runRoutine(bot.id, routine.id, true), /Daily is busy/);
  session.emit({ type: "turn.end" });
  await until(() => botStore.routine(bot.id, routine.id).runs[0].status !== "running");
  const [run] = botStore.routine(bot.id, routine.id).runs;
  assert.equal(run.status, "ok");
  assert.equal(run.test, true);
});

test("the scheduler runs a due routine once and moves it to the next slot", async t => {
  const { makeBot, sessions } = await fixture(t);
  const bot = makeBot({ name: "Ticker" });
  const routine = botStore.saveRoutine(bot.id, { name: "Ping", prompt: "Ping.", schedule: { kind: "interval", minutes: 5 }, paused: false });
  const due = routine.nextRunAt;
  checkRoutines(due);
  await until(() => sessions.get(bot.threadId)?.sent.length === 1);
  const ran = botStore.routine(bot.id, routine.id);
  assert.equal(ran.nextRunAt, ran.runs[0].startedAt + 5 * 60_000);
  checkRoutines(due);
  assert.equal(botStore.routine(bot.id, routine.id).runs.length, 1);
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
  store.addMessage(bot.threadId, { id: uid("msg"), role: "assistant", ts: Date.now(), parts: [{ id: uid("prt"), kind: "text", text: "  Draft is ready.  " }] });
  assert.equal(botStore.get(bot.id).preview, undefined);
  store.patchThread(bot.threadId, { running: false });
  assert.equal(botStore.get(bot.id).preview, "Draft is ready.");
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
  assert.deepEqual(groupStore.get(group.id).working, [scout.id]);
  assert.match(sessions.get(scout.threadId).sent[0], /from Launch Writer, another bot/);
  assert.equal(groupStore.get(group.id).preview, "Launch Writer: Draft ready. @Scout check the facts.");
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

test("weekly schedules find the next matching day and read naturally", () => {
  const schedule = { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" };
  const friday = new Date(2026, 9, 9, 9, 0).getTime();
  const next = new Date(nextRunAfter(schedule, friday));
  assert.equal(next.getDay(), 1);
  assert.equal(next.getHours(), 8);
  assert.match(describeSchedule(schedule), /^Every weekday at 8:00/);
  assert.equal(describeSchedule({ kind: "interval", minutes: 120 }), "Every 2 hours");
});
