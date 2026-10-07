export const REMOTE_PROTOCOL: number;
export const REMOTE_TOKEN_HEADER: string;
export interface RemoteHealth {
  environmentId: string;
  build?: string;
  protocol: number;
  [key: string]: unknown;
}
export function readRemoteHealth(options: {
  port: number;
  token: string;
  environmentId: string;
  timeout?: number;
  signal?: AbortSignal;
}): Promise<RemoteHealth | null>;
