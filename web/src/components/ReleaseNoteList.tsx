import type { ComponentType } from "react";
import { noteItem } from "../lib/release-note-items.ts";
import { ReleaseNoteFold } from "./ReleaseNoteFold.tsx";
import { ReleaseNoteText } from "./ReleaseNoteText.tsx";

const PREVIEW_ITEMS = 3;

type Glyph = ComponentType<{ size?: number }>;

export interface SectionLook {
  icon?: Glyph;
  marker: Glyph;
  tone: "brand" | "accent" | "ok" | "neutral";
}

export function ReleaseNoteList({ title, look: { icon: Icon, marker: Marker, tone }, items, onOpenSettings }: {
  title: string;
  look: SectionLook;
  items: string[];
  onOpenSettings: (section: string) => void;
}) {
  const list = (entries: string[]) => (
    <ul>
      {entries.map((item, index) => {
        const { lead, detail } = noteItem(item);
        return (
          <li key={index}>
            <span className="whats-new-marker" aria-hidden="true"><Marker size={10} /></span>
            <span><strong><ReleaseNoteText text={lead} onOpenSettings={onOpenSettings} /></strong>
            {detail && <> <ReleaseNoteText text={detail} onOpenSettings={onOpenSettings} /></>}</span>
          </li>
        );
      })}
    </ul>
  );
  return (
    <section className="whats-new-list" data-tone={tone}>
      <h3>
        {Icon && <Icon size={16} />}
        {title}
        <span>{items.length}</span>
      </h3>
      <ReleaseNoteFold items={items} preview={PREVIEW_ITEMS} render={list} />
    </section>
  );
}
