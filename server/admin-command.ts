import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const pkexec = ["/usr/bin/pkexec", "/usr/sbin/pkexec"].find(existsSync);

export const canRunAsAdmin = Boolean(pkexec);

export function runAsAdmin(command: string[], action: string): Promise<void> {
  if (!pkexec) return Promise.reject(new Error(`Run the command for ${action} shown in Citropy in a terminal.`));
  return new Promise((resolve, reject) => {
    const child = spawn(pkexec, command, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else if (code === 126 || code === 127) reject(new Error(`The ${action} was cancelled.`));
      else reject(new Error(error.trim() || `The ${action} failed (exit ${code}).`));
    });
  });
}
