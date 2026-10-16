import type { ReleaseNotes, ReleaseNoteSection } from "../../../shared/app-update.ts";
import { isSectionShown, settingsSections, type SettingsSection } from "./settings-sections.ts";
import { isNarrowViewport } from "./use-narrow-viewport.ts";

const LEAD_SENTENCE = /^(.+?[.!?])\s+(?=[A-Z0-9"'])(.+)$/s;
const SETTINGS_PLACE = new RegExp(
  `(?<=Settings > )(${settingsSections.map((section) => section.name).join("|")})\\b`,
);

export type NoteText = (string | SettingsSection)[];

export interface NoteItem {
  lead: NoteText;
  detail?: NoteText;
  place?: SettingsSection;
}

function openableSection(name: string) {
  const section = settingsSections.find((entry) => entry.name === name)!;
  return isSectionShown(section, isNarrowViewport()) ? section : name;
}

export function noteText(text: string): NoteText {
  return text
    .split(SETTINGS_PLACE)
    .map((part, index) => (index % 2 ? openableSection(part) : part))
    .filter((part) => part !== "");
}

export function mergedSections(notes: ReleaseNotes): ReleaseNoteSection[] {
  const byTitle = new Map<string, string[]>();
  for (const section of notes.sections)
    byTitle.set(section.title, [...(byTitle.get(section.title) ?? []), ...section.items]);
  return [...byTitle].map(([title, items]) => ({ title, items }));
}

export function noteItem(item: string): NoteItem {
  const [, lead = item, detail] = LEAD_SENTENCE.exec(item) ?? [];
  const leadText = noteText(lead);
  const detailText = detail ? noteText(detail) : undefined;
  const place = [...leadText, ...(detailText ?? [])].find((part) => typeof part !== "string");
  return { lead: leadText, detail: detailText, place };
}
