import { desktopRequest } from "./desktop.ts";
import type { Connection } from "../shared/features.ts";

export function listConnections(): Promise<Connection[]> {
  return desktopRequest<Connection[]>("connections.list");
}

export function handleConnections(method: string, operation: string, input: Record<string, unknown>): Promise<Connection[]> {
  if (operation === "" && method === "GET") return listConnections();
  if (operation === "" && method === "POST") return desktopRequest("connections.add", input);
  if (operation === "" && method === "DELETE") return desktopRequest("connections.remove", input);
  if (operation === "status" && method === "POST") return desktopRequest("connections.status", input);
  throw new Error("Unknown connections action");
}
