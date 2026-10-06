import type { ShellProcess } from "../../../shared/protocol.ts";
import { api } from "./api.ts";
import { isDevFake, stopFakeShell } from "./dev-triggers.ts";

export const isActiveShell = (shell: ShellProcess) => !shell.panelId && (shell.status === "running" || shell.status === "stopping");

export const shellStatus = (shell: ShellProcess) => shell.status === "stopping" ? "Stopping…" : shell.background ? "Background" : "Running";

export async function stopShell(id: string) {
  if (isDevFake(id)) return stopFakeShell(id);
  await api("shells/stop", { method: "POST", body: JSON.stringify({ id }) });
}
