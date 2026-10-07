import * as browser from "../browser.ts";
import { chooseFolder } from "../folder-picker.ts";
import { forgetGit, refreshGit } from "../git-monitor.ts";
import { closePanel, openPanel, panelList, renameTerminal } from "../panels.ts";
import { remoteId, workspaceDirectory } from "../remote.ts";
import { removeThread } from "./threads.ts";
import { store } from "../store.ts";
import * as terminals from "../terminals.ts";
import { workspacePath } from "../workspaces.ts";
import { PROJECT_SCRIPT_LIMITS as SCRIPT_LIMITS } from "../../shared/project-scripts.ts";
import type { ProjectScript } from "../../shared/protocol.ts";
import type { Routes } from "./types.ts";

function validScripts(scripts: unknown): ProjectScript[] {
  if (!Array.isArray(scripts) || scripts.length > SCRIPT_LIMITS.count) throw new Error(`Keep between 0 and ${SCRIPT_LIMITS.count} project scripts.`);
  return scripts.map((script: Partial<ProjectScript>) => {
    const name = typeof script?.name === "string" ? script.name.trim() : "";
    const command = typeof script?.command === "string" ? script.command.trim() : "";
    if (typeof script?.id !== "string" || !script.id) throw new Error("Project script is missing its id.");
    if (!name || name.length > SCRIPT_LIMITS.name) throw new Error(`Script name must be between 1 and ${SCRIPT_LIMITS.name} characters.`);
    if (!command || command.length > SCRIPT_LIMITS.command) throw new Error(`Script command must be between 1 and ${SCRIPT_LIMITS.command} characters.`);
    return { id: script.id, name, command };
  });
}

async function runInTerminal(projectId: string, threadId: string | undefined, name: string, command: string): Promise<void> {
  const cwd = workspacePath(projectId, threadId);
  const panel = openPanel(projectId, "terminal", threadId);
  renameTerminal(panel.id, name);
  try {
    await terminals.open(panel.id, cwd, 100, 28, command);
  } catch (error) {
    closePanel(panel.id);
    throw error;
  }
}

export async function closeProject(id: string): Promise<void> {
  for (const panel of panelList()) {
    if (panel.projectId !== id) continue;
    await terminals.close(panel.id);
    await browser.closeBrowser(panel.id);
    closePanel(panel.id);
  }
  for (const thread of store.threads.values()) {
    if (thread.projectId === id) await removeThread(thread.id);
  }
  store.closeProject(id);
  forgetGit(id);
}

export const projectRoutes: Routes = {
  "project.choose": async (event, send) => {
    try {
      if (remoteId && !event.path) throw new Error("Choose a folder on the SSH host.");
      const path = event.path ? await workspaceDirectory(event.path) : await chooseFolder();
      if (!path) return send({ t: "project.chosen", projectId: null });
      const project = store.openProject(path);
      send({ t: "project.chosen", projectId: project.id });
      await refreshGit(project.id, true);
    } catch (error) {
      send({ t: "project.chosen", projectId: null, error: (error as Error).message });
    }
  },
  "project.open": async (event) => {
    const project = store.openProject(event.path);
    await refreshGit(project.id, true);
  },
  "project.rename": (event) => {
    if (typeof event.name !== "string") throw new Error("Invalid project name.");
    const name = event.name.trim();
    if (!name || name.length > 80) throw new Error("Project name must be between 1 and 80 characters.");
    store.updateProject(event.id, { name });
  },
  "project.close": (event) => closeProject(event.id),
  "project.scripts": (event) => {
    store.updateProject(event.id, { scripts: validScripts(event.scripts) });
  },
  "project.runScript": async (event) => {
    const script = store.projects.get(event.projectId)?.scripts?.find((entry) => entry.id === event.scriptId);
    if (!script) throw new Error("Project script not found.");
    await runInTerminal(event.projectId, event.threadId, script.name, script.command);
  },
  "project.runCommand": async (event) => {
    const command = event.command.trim();
    if (!command || command.length > SCRIPT_LIMITS.command) throw new Error(`Command must be between 1 and ${SCRIPT_LIMITS.command} characters.`);
    await runInTerminal(event.projectId, event.threadId, command.split("\n")[0]!.slice(0, SCRIPT_LIMITS.name), command);
  },
};
