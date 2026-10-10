import { serverUrl } from "./environment.ts";

export function faviconUrl(origin: string): string {
  return serverUrl(`/api/favicon?url=${encodeURIComponent(origin)}`);
}
