import type { EnvironmentState } from "../../../../shared/environments.ts";

export type Connection = EnvironmentState["connections"][number];

const STATUS_LABELS: Record<Connection["status"], string> = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Not connected",
  error: "Could not connect",
};

export function connectionStatus(connection: Connection): string {
  return connection.message || STATUS_LABELS[connection.status];
}

export function connectionAddress(connection: Connection): string {
  return connection.port ? `${connection.target}:${connection.port}` : connection.target;
}
