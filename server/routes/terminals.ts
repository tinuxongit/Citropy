import { homedir } from "node:os";
import { isProviderId, signInTerminalId, type ClientEvent } from "../../shared/protocol.ts";
import { panelList } from "../panels.ts";
import { providerSignInCommand } from "../provider-sign-in.ts";
import { providers } from "../providers/index.ts";
import * as terminals from "../terminals.ts";
import { resolveWorkspace, workspacePath } from "../workspaces.ts";
import type { Routes } from "./types.ts";

async function openSignIn(event: Extract<ClientEvent, { t: "term.open" }> & { signIn: unknown }): Promise<boolean> {
  if (!isProviderId(event.signIn)) throw new Error("Unknown provider.");
  if (event.termId !== signInTerminalId(event.signIn)) throw new Error("This sign-in terminal does not match its provider.");
  await terminals.open(event.termId, homedir(), event.cols, event.rows, providerSignInCommand(providers[event.signIn]));
  return true;
}

async function openPanel(event: Extract<ClientEvent, { t: "term.open" }> & { projectId: string }): Promise<boolean> {
  const project = resolveWorkspace(event.projectId, event.threadId);
  if (!project) return false;
  const panel = panelList().find((entry) => entry.id === event.termId);
  if (panel?.kind !== "terminal" || panel.projectId !== project.id)
    throw new Error("This terminal tab is closed");
  await terminals.open(event.termId, workspacePath(project.id, panel.threadId), event.cols, event.rows);
  return true;
}

export const terminalRoutes: Routes = {
  "term.open": async (event, send) => {
    const opened = "signIn" in event ? await openSignIn(event) : await openPanel(event);
    if (!opened) return;
    send({ t: "term.data", termId: event.termId, ...terminals.replay(event.termId, event.offset, event.sessionId) });
  },
  "term.data": async (event) => {
    await terminals.write(event.termId, event.data);
  },
  "term.resize": async (event) => {
    await terminals.resize(event.termId, event.cols, event.rows);
  },
  "term.close": async (event) => {
    await terminals.close(event.termId);
  },
};
