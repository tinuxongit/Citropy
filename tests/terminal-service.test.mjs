import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = await mkdtemp(join(tmpdir(), "citropy-terminal-service-"));
process.env.CITROPY_DATA_DIR = root;
if (process.platform !== "win32") process.env.SHELL = "/bin/sh";
const terminals = await import("../server/terminals.ts");
const { openPanel } = await import("../server/panels.ts");
const { eventJournal } = await import("../server/event-journal.ts");
const { bus } = await import("../server/bus.ts");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 300; i++) { if (check()) return; await wait(20); }
  throw new Error("Terminal service timed out");
}

test("shells retain their process and history when the backend client disconnects", async () => {
  const panel = openPanel("project", "terminal");
  await terminals.open(panel.id, root, 80, 24, "cat");
  await terminals.write(panel.id, "before-restart\n");
  await until(() => terminals.read(panel.id).includes("before-restart"));
  terminals.detach();
  await terminals.restore();
  assert.match(terminals.read(panel.id), /before-restart/);
  await terminals.write(panel.id, "after-restart\n");
  await until(() => terminals.read(panel.id).includes("after-restart"));
  await terminals.close(panel.id);
});

test("terminal activity follows child processes without treating an idle shell as busy", { skip: process.platform === "win32" }, async () => {
  const panel = openPanel("project", "terminal");
  const { shellList } = await import("../server/shells.ts");
  const tracked = () => shellList(false).find(shell => shell.panelId === panel.id);
  try {
    await terminals.open(panel.id, root, 80, 24);
    await until(() => tracked()?.busy === false);
    await terminals.write(panel.id, "sleep 30\n");
    await until(() => tracked()?.busy === true);
    assert.equal(tracked().process, "sleep");
    terminals.detach();
    await terminals.restore();
    assert.equal(tracked().busy, true);
    await terminals.write(panel.id, "\u0003");
    await until(() => tracked()?.busy === false);
    assert.equal(tracked().process, undefined);
    await terminals.write(panel.id, "exit 0\n");
    await until(() => tracked()?.status === "finished");
    assert.equal(terminals.session(panel.id).busy, false);
  } finally { await terminals.close(panel.id); }
});

test("reattaching a terminal synchronizes the existing process with the new viewport", { skip: process.platform === "win32" }, async () => {
  const panel = openPanel("project", "terminal");
  try {
    await terminals.open(panel.id, root, 80, 24, "/bin/sh");
    await terminals.write(panel.id, "stty size\n");
    await until(() => /24 80\r?\n/.test(terminals.read(panel.id)));
    await terminals.open(panel.id, root, 42, 17);
    await terminals.write(panel.id, "stty size\n");
    await until(() => /17 42\r?\n/.test(terminals.read(panel.id)));
    terminals.detach();
    await terminals.restore();
    await terminals.open(panel.id, root, 110, 35);
    await terminals.write(panel.id, "stty size\n");
    await until(() => /35 110\r?\n/.test(terminals.read(panel.id)));
  } finally { await terminals.close(panel.id); }
});

test("slow consumers pause terminal output and release resumes it without an unbounded queue", { skip: process.platform === "win32" }, async () => {
  const panel = openPanel("project", "terminal");
  let received = 0;
  const unsubscribe = bus.subscribe(event => { if (event.t === "term.data" && event.termId === panel.id) received += event.data.length; });
  await terminals.open(panel.id, root, 80, 24, "/bin/sh -c 'while true; do printf terminal-output-1234567890; done'");
  await until(() => received > 1000);
  terminals.flow(panel.id, "slow-renderer", true);
  await wait(350);
  const pausedAt = received;
  await wait(150);
  assert.equal(received, pausedAt);
  assert.ok(terminals.read(panel.id).length <= 200000);
  terminals.release("slow-renderer");
  await until(() => received > pausedAt);
  await terminals.close(panel.id);
  unsubscribe();
});

test("reconnecting during output restores live viewers and never appends the same bytes twice", { skip: process.platform === "win32" }, async () => {
  const panel = openPanel("project", "terminal");
  const resets = [];
  const unsubscribe = bus.subscribe(event => { if (event.t === "term.data" && event.termId === panel.id && event.reset) resets.push(event.data); });
  try {
    await terminals.open(panel.id, root, 80, 24, "/bin/sh -c 'i=0; while [ $i -lt 80 ]; do printf \"item-%03d\\n\" $i; i=$((i+1)); sleep 0.01; done'");
    await until(() => terminals.read(panel.id).includes("item-005"));
    terminals.detach();
    await wait(120);
    await terminals.restore();
    assert.ok(resets.length > 0);
    await until(() => terminals.session(panel.id)?.running === false);
    const output = terminals.read(panel.id);
    for (let index = 0; index < 80; index++) assert.equal(output.split(`item-${String(index).padStart(3, "0")}`).length - 1, 1, output);
  } finally { unsubscribe(); await terminals.close(panel.id); }
});

test.after(async () => { await terminals.closeAll(); eventJournal.close(); await rm(root, { recursive: true, force: true }); });
