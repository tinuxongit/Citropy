import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { callWorkspaceTool } from "../server/mcp/mcp-workspace.ts";
import { providers } from "../server/providers/index.ts";
import * as routines from "../server/routines/routine-store.ts";
import { checkRoutines, runRoutine } from "../server/routines/scheduler.ts";
import { store } from "../server/store.ts";
import { describeSchedule, nextRunAfter } from "../shared/routines.ts";
import { hour12, hour24, periodOf, shiftTimeOfDay } from "../web/src/lib/time-of-day.ts";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-routines-"));
  const project = store.openProject(directory);
  const sessions = new Map();
  t.mock.method(providers.claude, "detect", async () => ({ available: true }));
  t.mock.method(providers.claude, "start", (options) => {
    const session = {
      emit: options.emit,
      sent: [],
      send(prompt) {
        this.sent.push(prompt);
      },
      dispose() {},
    };
    sessions.set(options.threadId, session);
    return session;
  });
  const makeThread = (title) =>
    store.createThread({
      projectId: project.id,
      provider: "claude",
      permissionMode: "manual",
      title,
    });
  t.after(async () => {
    store.closeProject(project.id);
    await rm(directory, { recursive: true, force: true });
  });
  return { makeThread, sessions };
}

async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for the routine.");
}

const at = (...parts) => new Date(...parts).getTime();

test("a regular conversation runs its routine and records the finished run", async (t) => {
  const { makeThread, sessions } = await fixture(t);
  const thread = makeThread("Daily");
  assert.throws(
    () =>
      routines.save(thread.id, {
        name: "Too often",
        prompt: "Check",
        schedule: { kind: "interval", minutes: 0 },
        paused: false,
      }),
    /from every minute/,
  );
  const routine = routines.save(thread.id, {
    name: "Inbox",
    prompt: "Summarize new mail.",
    schedule: { kind: "interval", minutes: 1 },
    paused: false,
  });
  assert.equal(store.threads.get(thread.id).messages.at(-1).parts[0].text, "Created routine Inbox");
  await runRoutine(thread.id, routine.id, true);
  const session = sessions.get(thread.id);
  assert.match(session.sent[0], /The routine "Inbox" is running/);
  assert.equal(routines.get(thread.id, routine.id).runs[0].status, "running");
  await assert.rejects(runRoutine(thread.id, routine.id, true), /Daily is busy/);
  session.emit({ type: "turn.end" });
  await until(() => routines.get(thread.id, routine.id).runs[0].status !== "running");
  const [run] = routines.get(thread.id, routine.id).runs;
  assert.equal(run.status, "ok");
  assert.equal(run.test, true);
});

test("the scheduler runs a due routine once and moves it to the next slot", async (t) => {
  const { makeThread, sessions } = await fixture(t);
  const thread = makeThread("Ticker");
  const routine = routines.save(thread.id, {
    name: "Ping",
    prompt: "Ping.",
    schedule: { kind: "interval", minutes: 5 },
    paused: false,
  });
  const due = routine.nextRunAt;
  checkRoutines(due);
  await until(() => sessions.get(thread.id)?.sent.length === 1);
  const ran = routines.get(thread.id, routine.id);
  assert.equal(ran.nextRunAt, ran.runs[0].startedAt + 5 * 60_000);
  checkRoutines(due);
  assert.equal(routines.get(thread.id, routine.id).runs.length, 1);
});

test("a one-time routine needs a future time and does not repeat", async (t) => {
  const { makeThread, sessions } = await fixture(t);
  const thread = makeThread("Reminder");
  assert.throws(
    () =>
      routines.save(thread.id, {
        name: "Late",
        prompt: "Remind me.",
        schedule: { kind: "once", at: Date.now() - 60_000 },
        paused: false,
      }),
    /future/,
  );
  const saved = JSON.parse(
    (
      await callWorkspaceTool(thread.id, "run_tool", {
        name: "routine_save",
        arguments: {
          name: "Call",
          prompt: "Remind me to call.",
          schedule: { kind: "once", at: "2099-01-15T09:00" },
        },
      })
    )[0].text,
  );
  assert.equal(saved.nextRunAt, new Date(2099, 0, 15, 9, 0).toISOString());
  routines.remove(thread.id, saved.id);
  const soon = routines.save(thread.id, {
    name: "Call",
    prompt: "Remind me to call.",
    schedule: { kind: "once", at: Date.now() + 50 },
    paused: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  checkRoutines();
  await until(() => sessions.get(thread.id)?.sent.length === 1);
  const done = routines.get(thread.id, soon.id);
  assert.equal(done.nextRunAt, undefined);
  routines.save(thread.id, {
    id: done.id,
    name: "Call mom",
    prompt: done.prompt,
    schedule: done.schedule,
    paused: false,
  });
  assert.equal(routines.get(thread.id, done.id).name, "Call mom");
});

test("a bot's routines live on its conversation and copy to a duplicate", async (t) => {
  const { makeThread } = await fixture(t);
  const source = makeThread("Scout");
  const copy = makeThread("Scout copy");
  routines.save(source.id, {
    name: "Digest",
    prompt: "Digest.",
    schedule: { kind: "weekly", days: [1], time: "08:00" },
    paused: false,
  });
  routines.copy(source.id, copy.id);
  const [copied] = routines.list(copy.id);
  assert.equal(copied.name, "Digest");
  assert.notEqual(copied.id, routines.list(source.id)[0].id);
  assert.deepEqual(copied.runs, []);
});

test("weekly and monthly schedules find the next matching day", () => {
  const weekly = { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" };
  const next = new Date(nextRunAfter(weekly, at(2026, 9, 9, 9, 0)));
  assert.equal(next.getDay(), 1);
  assert.equal(next.getHours(), 8);
  const monthly = { kind: "monthly", day: 31, time: "09:00" };
  assert.equal(nextRunAfter(monthly, at(2026, 1, 1)), at(2026, 1, 28, 9, 0));
  assert.equal(nextRunAfter(monthly, at(2026, 0, 31, 10, 0)), at(2026, 1, 28, 9, 0));
});

test("intervals stay inside their days and hours", () => {
  const office = {
    kind: "interval",
    minutes: 15,
    days: [1, 2, 3, 4, 5],
    from: "09:00",
    to: "17:00",
  };
  assert.equal(nextRunAfter(office, at(2026, 9, 12, 10, 0)), at(2026, 9, 12, 10, 15));
  assert.equal(nextRunAfter(office, at(2026, 9, 12, 7, 0)), at(2026, 9, 12, 9, 0));
  assert.equal(nextRunAfter(office, at(2026, 9, 16, 16, 50)), at(2026, 9, 19, 9, 0));
  assert.equal(
    nextRunAfter({ kind: "interval", minutes: 1 }, at(2026, 9, 12, 10, 0)),
    at(2026, 9, 12, 10, 1),
  );
});

test("schedules read naturally", () => {
  assert.match(
    describeSchedule({ kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" }),
    /^Every weekday at 8:00/,
  );
  assert.match(
    describeSchedule({ kind: "weekly", days: [0, 3], time: "08:00" }),
    /^Every Wed, Sun at 8:00/,
  );
  assert.equal(describeSchedule({ kind: "interval", minutes: 120 }), "Every 2 hours");
  assert.equal(describeSchedule({ kind: "interval", minutes: 1 }), "Every minute");
  assert.match(
    describeSchedule({
      kind: "interval",
      minutes: 15,
      days: [1, 2, 3, 4, 5],
      from: "09:00",
      to: "17:00",
    }),
    /^Every 15 minutes, weekdays from 9:00\sAM to 5:00\sPM$/,
  );
  assert.match(
    describeSchedule({ kind: "monthly", day: 1, time: "09:00" }),
    /^Day 1 of each month at 9:00/,
  );
  assert.match(
    describeSchedule({ kind: "once", at: at(2026, 9, 13, 9, 0) }),
    /^Once on Oct 13, 2026 at 9:00/,
  );
});

test("schedules follow the 24-hour clock when asked", () => {
  const clock24 = (ms, options) =>
    new Intl.DateTimeFormat("en-US", { ...options, hourCycle: "h23" }).format(ms);
  assert.equal(
    describeSchedule({ kind: "interval", minutes: 30, from: "09:00", to: "17:30" }, clock24),
    "Every 30 minutes from 09:00 to 17:30",
  );
  assert.equal(
    describeSchedule({ kind: "weekly", days: [1], time: "21:05" }, clock24),
    "Every Mon at 21:05",
  );
  assert.equal(
    describeSchedule({ kind: "once", at: at(2026, 9, 13, 14, 0) }, clock24),
    "Once on Oct 13, 2026 at 14:00",
  );
});

test("times move between the 12 and 24-hour clocks", () => {
  for (const [hours, hour, period] of [
    [0, 12, "am"],
    [9, 9, "am"],
    [12, 12, "pm"],
    [21, 9, "pm"],
  ]) {
    assert.equal(hour12(hours), hour);
    assert.equal(periodOf(hours), period);
    assert.equal(hour24(hour, period), hours);
  }
  assert.equal(shiftTimeOfDay("23:50", 15), "00:05");
  assert.equal(shiftTimeOfDay("00:05", -15), "23:50");
});
