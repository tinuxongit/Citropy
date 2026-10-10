import { desktopRequest } from "./desktop.ts";
import { openBrowser } from "./browser.ts";
import { closePanel, openPanel } from "./panels.ts";
import type { Connection } from "../shared/features.ts";

export function listConnections(): Promise<Connection[]> {
  return desktopRequest<Connection[]>("connections.list");
}

async function signIn(projectId: string, id: string): Promise<Connection[]> {
  const connection = (await listConnections()).find(entry => entry.id === id);
  if (!connection) throw new Error("Connection not found.");
  const panel = openPanel(projectId, "browser");
  try {
    await openBrowser(projectId, panel.id, undefined, connection.url);
  } catch (error) {
    closePanel(panel.id);
    throw error;
  }
  return listConnections();
}

export function handleConnections(method: string, operation: string, input: Record<string, unknown>, projectId: string | undefined): Promise<Connection[]> {
  if (operation === "" && method === "GET") return listConnections();
  if (operation === "" && method === "POST") return desktopRequest("connections.add", input);
  if (operation === "" && method === "DELETE") return desktopRequest("connections.remove", input);
  if (operation === "status" && method === "POST") return desktopRequest("connections.status", input);
  if (operation === "sign-in" && method === "POST") {
    if (!projectId) throw new Error("Open a project to sign in.");
    return signIn(projectId, String(input.id ?? ""));
  }
  throw new Error("Unknown connections action");
}
