import type { NoteText } from "../lib/release-note-items.ts";

export function ReleaseNoteText({ text, onOpenSettings }: { text: NoteText; onOpenSettings: (section: string) => void }) {
  return text.map((part, index) =>
    typeof part === "string" ? part : (
      <button key={index} type="button" className="whats-new-place" title={`Open Settings > ${part.name}`} onClick={() => onOpenSettings(part.name)}>
        <part.icon size={13} />
        {part.name}
      </button>
    ),
  );
}
