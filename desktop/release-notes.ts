import type { ReleaseNotes, ReleaseNoteSection } from "../shared/app-update.ts";

export const RELEASE_NOTE_HEADINGS: readonly string[] = ["Added", "Changed", "Fixed"];

function plain(text: string) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .trim();
}

export function parseReleaseNotes(markdown: string | null | undefined): ReleaseNoteSection[] {
  const sections: ReleaseNoteSection[] = [];
  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      sections.push({ title: plain(heading[1]!), items: [] });
      continue;
    }
    const item = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (!item) continue;
    let section = sections.at(-1);
    if (!section) sections.push((section = { title: "", items: [] }));
    section.items.push(plain(item[1]!));
  }
  return sections.filter((section) => section.items.length);
}

export async function fetchReleaseNotes(repository: string, version: string): Promise<ReleaseNoteSection[]> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the Citropy ${version} release notes.`);
  return parseReleaseNotes(((await response.json()) as { body?: string | null }).body);
}

export async function fetchReleaseHistory(repository: string): Promise<ReleaseNotes[]> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=50`, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the Citropy release list.`);
  const releases = (await response.json()) as Array<{ draft: boolean; prerelease: boolean; tag_name: string; body?: string | null }>;
  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ version: release.tag_name.replace(/^v/, ""), sections: parseReleaseNotes(release.body) }))
    .filter((release) => release.sections.length);
}
