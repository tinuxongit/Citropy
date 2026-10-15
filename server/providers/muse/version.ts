const RELEASE = /\b\d+\.\d+\.\d+-R\d+(?:\.\d+)?\b/;
const REVISION = /-R(\d+)(?:\.(\d+))?$/;

export function museVersion(output: string): string | undefined {
  return output.match(RELEASE)?.[0];
}

export function comparableMuseVersion(version: string): string {
  return version.replace(REVISION, (_, release: string, patch?: string) => `-release.${release}.${patch ?? "0"}`);
}
