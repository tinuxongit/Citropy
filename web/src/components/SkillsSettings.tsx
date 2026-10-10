import { useId, useState, type KeyboardEvent } from "react";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { CitropySkills } from "./skills/CitropySkills.tsx";
import { InstalledSkills } from "./skills/InstalledSkills.tsx";

const TABS = [
  { id: "citropy", label: "Citropy skills", Panel: CitropySkills },
  { id: "installed", label: "Installed skills", Panel: InstalledSkills },
] as const;
const ARROW_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

export function SkillsSettings() {
  const id = useId();
  const [tabId, setTabId] = useState<(typeof TABS)[number]["id"]>(TABS[0].id);
  const index = TABS.findIndex((entry) => entry.id === tabId);
  const { Panel } = TABS[index]!;
  const moveFocus = (event: KeyboardEvent) => {
    const step = ARROW_STEPS[event.key];
    if (!step) return;
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    setTabId(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  };
  return (
    <div className="feature-stack">
      <div className="segmented-tabs sliding-selection" role="tablist" aria-label="Skill types" onKeyDown={moveFocus}>
        <SelectionHighlight value={tabId} />
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${id}-${entry.id}`}
            aria-selected={entry.id === tabId}
            aria-controls={`${id}-panel`}
            tabIndex={entry.id === tabId ? 0 : -1}
            onClick={() => setTabId(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="feature-stack" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tabId}`}>
        <Panel />
      </div>
    </div>
  );
}
