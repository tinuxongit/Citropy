import type { ReleaseNotes } from "../../../shared/app-update.ts";
import { mergedSections, noteItem } from "../lib/release-note-items.ts";
import { ArrowRightIcon } from "./icons/arrows.tsx";
import { CheckIcon, PlusIcon } from "./icons/marks.tsx";
import { WrenchIcon } from "./icons/objects.tsx";
import { RefreshIcon } from "./icons/rotation.tsx";
import { ReleaseNoteFold } from "./ReleaseNoteFold.tsx";
import { ReleaseNoteList, type SectionLook } from "./ReleaseNoteList.tsx";
import { ReleaseNoteText } from "./ReleaseNoteText.tsx";
import { SparkleIcon } from "./SparkleIcon.tsx";

const TILE_SECTION = "Added";
const PREVIEW_TILES = 5;
const SECTION_LOOKS: Record<string, SectionLook> = {
  Added: { icon: SparkleIcon, marker: PlusIcon, tone: "brand" },
  Changed: { icon: RefreshIcon, marker: ArrowRightIcon, tone: "accent" },
  Fixed: { icon: WrenchIcon, marker: CheckIcon, tone: "ok" },
};
const OTHER_SECTION_LOOK: SectionLook = { marker: ArrowRightIcon, tone: "neutral" };
const lookOf = (title: string) => SECTION_LOOKS[title] ?? OTHER_SECTION_LOOK;

export function ReleaseNoteTiles({ notes, onOpenSettings }: { notes: ReleaseNotes; onOpenSettings: (section: string) => void }) {
  const sections = mergedSections(notes);
  const tiled = sections.find((section) => section.title === TILE_SECTION)?.items ?? [];
  const tiles = (entries: string[], offset: number) => (
    <div className="whats-new-tiles">
      {entries.map((item, index) => {
        const { lead, detail, place } = noteItem(item);
        const Icon = place?.icon ?? lookOf(TILE_SECTION).icon!;
        return (
          <article key={index} className="whats-new-tile" data-feature={offset + index === 0 || undefined}>
            <span className="whats-new-tile-icon"><Icon size={18} /></span>
            <h3><ReleaseNoteText text={lead} onOpenSettings={onOpenSettings} /></h3>
            {detail && <p><ReleaseNoteText text={detail} onOpenSettings={onOpenSettings} /></p>}
          </article>
        );
      })}
    </div>
  );
  return (
    <div className="whats-new-board">
      {tiled.length > 0 && <div><ReleaseNoteFold items={tiled} preview={PREVIEW_TILES} render={tiles} /></div>}
      {sections
        .filter((section) => section.title !== TILE_SECTION)
        .map((section) => <ReleaseNoteList key={section.title} {...section} look={lookOf(section.title)} onOpenSettings={onOpenSettings} />)}
    </div>
  );
}
