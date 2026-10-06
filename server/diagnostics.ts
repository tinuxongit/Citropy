import { dev } from "./config.ts";
import { cpus, freemem, totalmem, loadavg } from "node:os";
import { desktopConnected, desktopRequest } from "./desktop.ts";
import { store } from "./store.ts";
import { panelList } from "./panels.ts";
import { browserStates } from "./browser.ts";
import { servicePid } from "./terminals.ts";
import { processCpuPercent, processTable, type ProcessCpuSample, type ProcessEntry } from "./process-table.ts";
import { protocolLog } from "./providers/events.ts";
import type { DiagnosticReport } from "../shared/features.ts";

let previousProcesses = new Map<number, ProcessCpuSample>();
let pending: Promise<DiagnosticReport> | undefined;
let cached: { at: number; report: DiagnosticReport } | undefined;
const serverStartedAt = `server:${process.pid}:${Date.now() - process.uptime() * 1000}`;

export async function diagnostics(): Promise<DiagnosticReport> {
  if (cached && performance.now() - cached.at < 1000) return cached.report;
  pending ??= collect().then((report) => {
    cached = { at: performance.now(), report };
    return report;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function collect(): Promise<DiagnosticReport> {
  const memory = process.memoryUsage();
  const terminalPid = servicePid();
  const [processes, desktop] = await Promise.all([
    processTable([process.pid, ...(terminalPid ? [terminalPid] : [])]),
    desktopConnected() ? desktopRequest<ProcessEntry[]>("diagnostics").then((entries) => {
      const sampledAt = performance.now();
      return entries.map((entry) => ({ ...entry, sampledAt }));
    }) : [],
  ]);
  const allProcesses = new Map(processes.map((entry) => [entry.pid, entry]));
  for (const entry of desktop) {
    const existing = allProcesses.get(entry.pid);
    allProcesses.set(entry.pid, existing ? { ...existing, name: entry.name } : entry);
  }
  const cpu = process.cpuUsage();
  const ownProcess = allProcesses.get(process.pid);
  if (!ownProcess || ownProcess.cpuTime === undefined)
    allProcesses.set(process.pid, {
      ...ownProcess,
      pid: process.pid,
      parent: process.ppid,
      name: ownProcess?.name ?? "Citropy server",
      cpu: 0,
      cpuTime: (cpu.user + cpu.system) / 1_000_000,
      startedAt: serverStartedAt,
      sampledAt: performance.now(),
      memory: memory.rss,
    });
  const at = performance.now();
  const sampledProcesses = [...allProcesses.values()].map((entry) => ({
    pid: entry.pid,
    parent: entry.parent,
    name: entry.name,
    memory: entry.memory,
    startedAt: entry.startedAt,
    cpu: processCpuPercent(entry, previousProcesses.get(entry.pid), entry.sampledAt ?? at),
  })).sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1));
  previousProcesses = new Map([...allProcesses.values()].map((entry) => [entry.pid, { startedAt: entry.startedAt, cpuTime: entry.cpuTime, at: entry.sampledAt ?? at }]));
  return {
    ...(dev ? { protocol: protocolLog() } : {}),
    sampledAt: Date.now(),
    uptime: process.uptime(),
    system: {
      memoryTotal: totalmem(),
      memoryFree: freemem(),
      cores: cpus().length,
      load: loadavg(),
    },
    server: {
      pid: process.pid,
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
    },
    processes: sampledProcesses,
    conversations: store.threads.size,
    running: [...store.threads.values()].filter((thread) => thread.running)
      .length,
    terminals: panelList().filter((panel) => panel.kind === "terminal").length,
    browsers: browserStates().length,
  };
}
