export function downloadVerified(options: {
  url: string;
  sha256: string;
  maxBytes: number;
  timeout: number;
  label: string;
  signal: AbortSignal;
  redirect: RequestRedirect;
}): Promise<Buffer>;
