import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export interface TerminalProcess { pid: number; parent: number; name: string }

export function parseTerminalProcesses(output: string, windows = false): TerminalProcess[] {
  if (windows) {
    const value: unknown = JSON.parse(output || "[]");
    return (Array.isArray(value) ? value : [value]).flatMap(row => {
      if (!row || !Number.isSafeInteger(row.ProcessId) || !Number.isSafeInteger(row.ParentProcessId) || typeof row.Name !== "string") return [];
      return [{ pid: row.ProcessId, parent: row.ParentProcessId, name: row.Name }];
    });
  }
  return output.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match || match[3]!.startsWith("Z")) return [];
    return [{ pid: Number(match[1]), parent: Number(match[2]), name: match[4]!.trim() }];
  });
}

export async function terminalProcesses(): Promise<TerminalProcess[]> {
  const windows = process.platform === "win32";
  const { stdout } = await execute(windows ? "powershell.exe" : "ps", windows
    ? ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"]
    : ["-eo", "pid=,ppid=,stat=,comm="], { timeout: 3000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  return parseTerminalProcesses(stdout, windows);
}
