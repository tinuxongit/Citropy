import { desktopRequest } from "./desktop.ts";
import { browserStates, closeBrowser } from "./browser.ts";
import type { Connection } from "../shared/features.ts";

export function listConnections(): Promise<Connection[]> {
  return desktopRequest<Connection[]>("connections.list");
}

export async function accountProfileId(id: string): Promise<string> {
  const account = (await listConnections())
    .flatMap((connection) => connection.accounts)
    .find((entry) => entry.id === id);
  if (!account) throw new Error(`No account ${id}. Check browser_connections.`);
  return account.profileId;
}

async function closeAccountTabs(id: unknown): Promise<void> {
  await Promise.all(
    browserStates()
      .filter((state) => state.account?.id === id)
      .map((state) => closeBrowser(state.id)),
  );
}

export async function handleConnections(
  method: string,
  operation: string,
  input: Record<string, unknown>,
): Promise<Connection[]> {
  if (operation === "" && method === "GET") return listConnections();
  if (operation === "" && method === "POST") return desktopRequest("connections.add", input);
  if (operation === "accounts" && method === "POST")
    return desktopRequest("connections.add-account", input);
  if (operation === "" && method === "DELETE") {
    await closeAccountTabs(input.id);
    return desktopRequest("connections.remove", input);
  }
  if (operation === "status" && method === "POST") {
    if (input.signedIn === false) await closeAccountTabs(input.id);
    return desktopRequest("connections.status", input);
  }
  throw new Error("Unknown connections action");
}
