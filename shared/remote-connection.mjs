const HEALTH_TIMEOUT_MS = 800;

export const REMOTE_PROTOCOL = 1;
export const REMOTE_TOKEN_HEADER = "x-citropy-remote-token";

export async function readRemoteHealth({ port, token, environmentId, timeout = HEALTH_TIMEOUT_MS, signal }) {
  const health = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: { [REMOTE_TOKEN_HEADER]: token },
    signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]),
  }).then(response => response.ok ? response.json() : null).catch(() => null);
  return health?.environmentId === environmentId && health.protocol === REMOTE_PROTOCOL ? health : null;
}
