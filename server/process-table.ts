import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ProcessEntry {
  pid: number;
  parent: number;
  cpu: number;
  memory: number;
  name: string;
  startedAt?: string;
  cpuTime?: number;
  cpuInterval?: boolean;
  sampledAt?: number;
}

export interface ProcessCpuSample {
  startedAt?: string;
  cpuTime?: number;
  at: number;
}

export function processCpuPercent(entry: ProcessEntry, previous: ProcessCpuSample | undefined, at: number): number | null {
  if (!previous || !entry.startedAt || entry.startedAt !== previous.startedAt) return null;
  const elapsed = at - previous.at;
  if (elapsed <= 0 || elapsed > 10_000) return null;
  if (entry.cpuTime !== undefined && previous.cpuTime !== undefined) {
    const used = entry.cpuTime - previous.cpuTime;
    return used >= 0 && Number.isFinite(used) ? used / elapsed * 100_000 : null;
  }
  return entry.cpuInterval && Number.isFinite(entry.cpu) && entry.cpu >= 0 ? entry.cpu : null;
}

function cpuTime(value: string): number {
  const [days, time] = value.includes("-") ? value.split("-") : ["0", value];
  const parts = time!.split(":").map(Number);
  return Number(days) * 86400 + parts.reduce((total, part) => total * 60 + part, 0);
}

export function parseProcessTable(output: string, platform = process.platform): ProcessEntry[] {
  if (platform === "win32") {
    const value: unknown = JSON.parse(output || "[]");
    return (Array.isArray(value) ? value : [value]).flatMap((row) => {
      if (!row || !Number.isSafeInteger(row.ProcessId) || row.ProcessId < 1 || !Number.isSafeInteger(row.ParentProcessId) || row.ParentProcessId < 0 || typeof row.Name !== "string") return [];
      const memory = Number(row.WorkingSetSize);
      const started = typeof row.StartedAt === "string" ? Date.parse(row.StartedAt) : NaN;
      const user = row.UserModeTime === null || row.UserModeTime === undefined ? NaN : Number(row.UserModeTime);
      const kernel = row.KernelModeTime === null || row.KernelModeTime === undefined ? NaN : Number(row.KernelModeTime);
      const used = (user + kernel) / 10_000_000;
      return [{ pid: row.ProcessId, parent: row.ParentProcessId, name: row.Name, memory: Number.isFinite(memory) && memory >= 0 ? memory : 0, cpu: 0,
        ...(Number.isFinite(started) ? { startedAt: `windows:${row.StartedAt}` } : {}),
        ...(user >= 0 && kernel >= 0 && Number.isFinite(used) ? { cpuTime: used } : {}),
      }];
    });
  }
  return output.split(/\r?\n/).flatMap((line) => {
    const match = (platform === "darwin"
      ? /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+([\d.:+-]+)\s+(.+)$/
      : /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/).exec(line);
    if (!match) return [];
    const entry: ProcessEntry = { pid: Number(match[1]), parent: Number(match[2]), cpu: Number(match[3]), memory: Number(match[4]) * 1024, name: match[platform === "darwin" ? 7 : 5]! };
    if (platform === "darwin") {
      const used = cpuTime(match[6]!);
      if (Number.isFinite(used) && used >= 0) {
        entry.startedAt = `mac:${match[5]!.replace(/\s+/g, " ")}`;
        entry.cpuTime = used;
      }
    }
    return [entry];
  });
}

export function parseLinuxProcessStat(value: string, ticks: number): Pick<ProcessEntry, "parent" | "startedAt" | "cpuTime"> | undefined {
  const fields = value.slice(value.lastIndexOf(")") + 2).trim().split(/\s+/);
  const parent = Number(fields[1]);
  const user = Number(fields[11]);
  const system = Number(fields[12]);
  const started = fields[19];
  if (!Number.isSafeInteger(parent) || parent < 0 || !started || !/^\d+$/.test(started) || !Number.isFinite(user) || user < 0 || !Number.isFinite(system) || system < 0 || !Number.isFinite(ticks) || ticks <= 0) return undefined;
  return { parent, startedAt: `linux:${started}`, cpuTime: (user + system) / ticks };
}

export function parseLinuxProportionalMemory(value: string): number | undefined {
  const kilobytes = /^Pss:\s+(\d+) kB$/m.exec(value)?.[1];
  return kilobytes === undefined ? undefined : Number(kilobytes) * 1024;
}

async function readProcessFile(path: string): Promise<string> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(error.code ?? "")) return "";
    throw error;
  });
}

let scanning: Promise<ProcessEntry[]> | undefined;
let clockTicks: Promise<number> | undefined;

export async function processTable(roots?: number[]): Promise<ProcessEntry[]> {
  if (process.platform === "win32" && !roots) return [];
  scanning ??= (async () => {
    const windows = process.platform === "win32";
    const scan = run(windows ? "powershell.exe" : "ps", windows
      ? ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,KernelModeTime,UserModeTime,WorkingSetSize,@{Name='StartedAt';Expression={if ($_.CreationDate) {$_.CreationDate.ToUniversalTime().ToString('o')}}} | ConvertTo-Json -Compress"]
      : ["-axo", process.platform === "darwin" ? "pid=,ppid=,%cpu=,rss=,lstart=,time=,comm=" : "pid=,ppid=,%cpu=,rss=,comm="],
    { timeout: 5000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: "C" } });
    const { stdout } = await scan;
    const sampledAt = performance.now();
    return parseProcessTable(stdout).filter((entry) => entry.pid !== scan.child.pid).map((entry) => ({ ...entry, sampledAt }));
  })().finally(() => { scanning = undefined; });
  let table = await scanning;
  if (roots) {
    const included = descendants(table, roots);
    table = table.filter((entry) => included.has(entry.pid));
  }
  if (process.platform !== "linux" || !roots) return table;
  clockTicks ??= run("getconf", ["CLK_TCK"], { timeout: 5000 }).then(({ stdout }) => {
    const ticks = Number(stdout.trim());
    if (!Number.isFinite(ticks) || ticks <= 0) throw new Error("Invalid process clock frequency.");
    return ticks;
  }).catch((error) => { clockTicks = undefined; throw error; });
  const ticks = await clockTicks;
  const sampled = await Promise.all(table.map(async (entry) => {
    const [value, memory] = await Promise.all([readProcessFile(`/proc/${entry.pid}/stat`), readProcessFile(`/proc/${entry.pid}/smaps_rollup`)]);
    const usage = parseLinuxProcessStat(value, ticks);
    return usage ? [{ ...entry, ...usage, memory: parseLinuxProportionalMemory(memory) ?? entry.memory, sampledAt: performance.now() }] : [];
  }));
  table = sampled.flat();
  const included = descendants(table, roots);
  return table.filter((entry) => included.has(entry.pid));
}

export function descendants(table: ProcessEntry[], roots: number[]): Set<number> {
  const created = new Map(table.filter((entry) => entry.startedAt?.startsWith("windows:")).map((entry) => [entry.pid, Date.parse(entry.startedAt!.slice(8))]));
  const children = new Map<number, number[]>();
  for (const entry of table) {
    const parentCreated = created.get(entry.parent);
    const childCreated = created.get(entry.pid);
    if (parentCreated !== undefined && childCreated !== undefined && parentCreated > childCreated) continue;
    const family = children.get(entry.parent);
    if (family) family.push(entry.pid);
    else children.set(entry.parent, [entry.pid]);
  }
  const included = new Set(roots);
  const pending = [...included];
  for (let index = 0; index < pending.length; index++) {
    for (const pid of children.get(pending[index]!) ?? []) {
      if (included.has(pid)) continue;
      included.add(pid);
      pending.push(pid);
    }
  }
  return included;
}
