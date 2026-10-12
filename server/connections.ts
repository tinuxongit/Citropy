import { desktopRequest } from "./desktop.ts";
import { browserStates, closeBrowser } from "./browser.ts";
import type { Connection } from "../shared/features.ts";

export function listConnections(): Promise<Connection[]> {
  return desktopRequest<Connection[]>("connections.list");
}

async function closeConnectionTabs(id: unknown): Promise<void> {
  await Promise.all(browserStates().filter((state) => state.connection?.id === id).map((state) => closeBrowser(state.id)));
}

export async function handleConnections(method: string, operation: string, input: Record<string, unknown>): Promise<Connection[]> {
  if (operation === "" && method === "GET") return listConnections();
  if (operation === "" && method === "POST") return desktopRequest("connections.add", input);
  if (operation === "" && method === "DELETE") {
    await closeConnectionTabs(input.id);
    return desktopRequest("connections.remove", input);
  }
  if (operation === "status" && method === "POST") {
    if (input.signedIn === false) await closeConnectionTabs(input.id);
    return desktopRequest("connections.status", input);
  }
  throw new Error("Unknown connections action");
}
