import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { descendants, parseLinuxProcessStat, parseProcessTable, processCpuPercent, processTable } from "../server/process-table.ts";

test("process CPU uses elapsed time and cumulative counters rather than lifetime averages", () => {
  const entry = { pid: 5, parent: 1, name: "agent", memory: 1024, cpu: 3, startedAt: "generation-1", cpuTime: 12 };
  const previous = { startedAt: "generation-1", cpuTime: 10, at: 1000 };
  assert.equal(processCpuPercent(entry, previous, 4000), 200 / 3);
  assert.equal(processCpuPercent({ ...entry, cpuTime: 16 }, previous, 4000), 200);
  assert.equal(processCpuPercent({ ...entry, cpuTime: 10 }, previous, 4000), 0);
  assert.equal(processCpuPercent(entry, undefined, 4000), null);
  assert.equal(processCpuPercent({ ...entry, startedAt: "generation-2" }, previous, 4000), null);
  assert.equal(processCpuPercent({ ...entry, cpuTime: 9 }, previous, 4000), null);
  assert.equal(processCpuPercent(entry, previous, 1000), null);
  assert.equal(processCpuPercent(entry, previous, 12000), null);
  assert.equal(processCpuPercent({ ...entry, cpuTime: undefined }, { ...previous, cpuTime: undefined }, 4000), null);
  assert.equal(processCpuPercent({ ...entry, cpuTime: undefined, cpuInterval: true }, { ...previous, cpuTime: undefined }, 4000), 3);
});

test("Linux process counters keep birth identity when the name contains parentheses", () => {
  const fields = Array(50).fill("0");
  fields[0] = "R";
  fields[1] = "10";
  fields[11] = "150";
  fields[12] = "50";
  fields[19] = "123456";
  assert.deepEqual(parseLinuxProcessStat(`42 (coding ) (agent)) ${fields.join(" ")}`, 100), { parent: 10, cpuTime: 2, startedAt: "linux:123456" });
  assert.equal(parseLinuxProcessStat("invalid", 100), undefined);
  assert.equal(parseLinuxProcessStat(`42 (agent) ${fields.join(" ")}`, 0), undefined);
});

test("platform snapshots parse cumulative CPU and preserve process names", () => {
  assert.deepEqual(parseProcessTable("10 1 2.5 2048 /usr/bin/node\ninvalid", "linux"), [{ pid: 10, parent: 1, cpu: 2.5, memory: 2097152, name: "/usr/bin/node" }]);
  assert.deepEqual(parseProcessTable("10 1 2.5 2048 Fri Oct  2 10:12:00 2026 01:02.34 My Program", "darwin"), [{ pid: 10, parent: 1, cpu: 2.5, memory: 2097152, name: "My Program", startedAt: "mac:Fri Oct 2 10:12:00 2026", cpuTime: 62.34 }]);
  const row = { ProcessId: 10, ParentProcessId: 1, Name: "node.exe", StartedAt: "2026-10-02T10:12:00.1234567Z", WorkingSetSize: "2097152", UserModeTime: "15000000", KernelModeTime: "5000000" };
  assert.deepEqual(parseProcessTable(JSON.stringify(row), "win32"), [{ pid: 10, parent: 1, name: "node.exe", memory: 2097152, cpu: 0, startedAt: `windows:${row.StartedAt}`, cpuTime: 2 }]);
  assert.deepEqual(parseProcessTable(JSON.stringify([{ ...row, ProcessId: 0 }, { ...row, ProcessId: "10" }, null]), "win32"), []);
  const unavailable = parseProcessTable(JSON.stringify({ ...row, StartedAt: null, UserModeTime: null }), "win32")[0];
  assert.equal(unavailable.startedAt, undefined);
  assert.equal(unavailable.cpuTime, undefined);
});

test("process tree traversal handles deep unordered trees, cycles and multiple roots", () => {
  const table = Array.from({ length: 10000 }, (_, index) => ({ pid: index + 1, parent: index })).reverse();
  table.push({ pid: 20001, parent: 20002 }, { pid: 20002, parent: 20001 });
  assert.equal(descendants(table, [1]).size, 10000);
  assert.deepEqual([...descendants(table, [20001, 20002])].sort(), [20001, 20002]);
  assert.deepEqual([...descendants([
    { pid: 1, parent: 0, startedAt: "windows:2026-10-02T10:00:00Z" },
    { pid: 2, parent: 1, startedAt: "windows:2026-10-02T09:00:00Z" },
    { pid: 3, parent: 1, startedAt: "windows:2026-10-02T11:00:00Z" },
  ], [1])], [1, 3]);
});

test("native resource sampling includes this process with a stable birth identity", async () => {
  const [first, second] = await Promise.all([processTable([process.pid]), processTable([process.pid])]);
  const before = first.find((entry) => entry.pid === process.pid);
  const after = second.find((entry) => entry.pid === process.pid);
  assert.ok(before);
  assert.ok(after);
  assert.ok(before.memory > 0);
  assert.ok(before.startedAt);
  assert.equal(before.startedAt, after.startedAt);
  assert.ok(Number.isFinite(before.cpuTime));
  const later = (await processTable([process.pid])).find((entry) => entry.pid === process.pid);
  assert.ok(later.cpuTime >= Math.max(before.cpuTime, after.cpuTime));
  assert.ok(!first.some((entry) => entry.pid === process.ppid));
});

test("diagnostics coalesce requests and reset CPU attribution for reused or departed PIDs", async (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const { attachDesktop } = await import("../server/desktop.ts");
  const { diagnostics } = await import("../server/diagnostics.ts");
  const socket = new EventEmitter();
  socket.OPEN = 1;
  socket.readyState = 1;
  socket.close = () => socket.emit("close");
  let requests = 0;
  let generation = "electron:100";
  let used = 10;
  let present = true;
  socket.send = (raw) => {
    requests++;
    const request = JSON.parse(raw);
    const result = [{ pid: process.pid, parent: process.ppid, name: "Citropy Browser", memory: 1, cpu: 99, cpuInterval: true, cpuTime: 99, startedAt: "electron:1" }];
    if (present) result.push({ pid: 2147483647, parent: process.pid, name: "Citropy GPU", memory: 1024, cpu: 1, cpuInterval: true, cpuTime: used, startedAt: generation });
    queueMicrotask(() => socket.emit("message", JSON.stringify({ id: request.id, result })));
  };
  attachDesktop(socket);
  t.after(() => socket.close());
  const [first, concurrent] = await Promise.all([diagnostics(), diagnostics()]);
  assert.strictEqual(first, concurrent);
  assert.equal(requests, 1);
  assert.equal(first.processes.find((entry) => entry.pid === 2147483647).cpu, null);
  assert.equal(first.processes.filter((entry) => entry.pid === process.pid).length, 1);
  assert.ok(first.processes.find((entry) => entry.pid === process.pid).memory > 1);
  assert.strictEqual(await diagnostics(), first);
  assert.equal(requests, 1);
  now = 4000;
  used = 12;
  const next = await diagnostics();
  assert.equal(next.processes.find((entry) => entry.pid === 2147483647).cpu, 200 / 3);
  now = 7000;
  generation = "electron:200";
  assert.equal((await diagnostics()).processes.find((entry) => entry.pid === 2147483647).cpu, null);
  now = 10000;
  present = false;
  assert.ok(!(await diagnostics()).processes.some((entry) => entry.pid === 2147483647));
  now = 13000;
  present = true;
  assert.equal((await diagnostics()).processes.find((entry) => entry.pid === 2147483647).cpu, null);
  now = 26000;
  used = 16;
  assert.equal((await diagnostics()).processes.find((entry) => entry.pid === 2147483647).cpu, null);
});
