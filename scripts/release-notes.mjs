import { readFileSync } from "node:fs";
import { parseReleaseNotes, RELEASE_NOTE_HEADINGS } from "../desktop/release-notes.mjs";

const version = process.argv[2];
if (!version) throw new Error("Usage: node scripts/release-notes.mjs VERSION");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const heading = `## ${version}`;
const start = changelog.split(/\r?\n/).findIndex((line) => line.trim() === heading);
if (start < 0) throw new Error(`CHANGELOG.md has no "${heading}" section. Describe the changes in ${version} before releasing it.`);
const lines = changelog.split(/\r?\n/).slice(start + 1);
const end = lines.findIndex((line) => /^## /.test(line));
const notes = lines.slice(0, end < 0 ? undefined : end).join("\n").trim();
const sections = parseReleaseNotes(notes);
if (!sections.length) throw new Error(`The "${heading}" section in CHANGELOG.md lists no changes. Add at least one "- " item.`);
const allowed = RELEASE_NOTE_HEADINGS.map((title) => `"### ${title}"`).join(", ");
for (const [index, section] of sections.entries()) {
  if (!RELEASE_NOTE_HEADINGS.includes(section.title)) throw new Error(`The "${heading}" section in CHANGELOG.md puts items under "${section.title || "no heading"}". Use only ${allowed}.`);
  if (sections.findIndex((other) => other.title === section.title) !== index) throw new Error(`The "${heading}" section in CHANGELOG.md has "### ${section.title}" twice. Merge them into one.`);
}
console.log(notes);
