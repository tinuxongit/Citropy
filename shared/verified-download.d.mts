interface DownloadOptions {
  url: string;
  sha256: string;
  maxBytes: number;
  timeout: number;
  label: string;
  signal: AbortSignal;
  redirect: RequestRedirect;
  progress?: (bytes: number) => void;
}

export function downloadVerified(options: DownloadOptions): Promise<Buffer>;

export function downloadVerifiedFile(options: DownloadOptions, path: string): Promise<void>;
