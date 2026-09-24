export const nodeVersion: string;
export const nodeChecksums: Record<string, string>;
export function nodeArchiveName(platform: string): string;
export function downloadNodeArchive(platform: string, signal: AbortSignal): Promise<Buffer>;
