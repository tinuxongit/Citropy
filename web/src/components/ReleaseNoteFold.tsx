import { useState, type ReactNode } from "react";
import { Collapsible } from "./Collapsible.tsx";

export function ReleaseNoteFold({ items, preview, render }: {
  items: string[];
  preview: number;
  render: (entries: string[], offset: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const folded = items.length > preview + 1 ? items.slice(preview) : [];
  if (!folded.length) return render(items, 0);
  return (
    <>
      {render(items.slice(0, preview), 0)}
      <Collapsible open={expanded} className="whats-new-folded">{render(folded, preview)}</Collapsible>
      <button type="button" className="whats-new-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show fewer" : `Show ${folded.length} more`}
      </button>
    </>
  );
}
