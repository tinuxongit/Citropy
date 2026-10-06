import { useMemo } from "react";
import { useDisclosure } from "../../lib/use-disclosure.ts";
import { Collapsible } from "../Collapsible.tsx";
import { AlertTriangle, Ban, ChevronRight, ExternalLink, shapeIcon } from "../icons.ts";
import { toolLabel } from "../../lib/group.ts";
import { DiffView } from "../DiffView.tsx";
import { ansiToHtml } from "../../lib/ansi.ts";
import { duration } from "../../lib/format.ts";
import type { ToolPart } from "../../../../shared/protocol.ts";
import { ImageStrip } from "./ImageStrip.tsx";
import { PixelLoader } from "../PixelLoader.tsx";
import { FileIcon } from "../FileIcon.tsx";
import { LineCounts } from "../LineCounts.tsx";

export function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useDisclosure(part.id, "tool");
  const Icon = shapeIcon[part.shape];
  const label = toolLabel(part.name, part.status);
  const elapsed = part.endedAt ? part.endedAt - part.startedAt : null;
  const output = part.output ?? "";
  const hasImages = Boolean(part.images?.length || part.imageFiles?.length);
  const fileShape = ["read", "edit", "write"].includes(part.shape);

  const url = part.shape === "web" ? part.headline : null;
  const command = part.shape === "command"
    ? part.input && typeof part.input === "object" && "command" in part.input && typeof part.input.command === "string"
      ? part.input.command
      : part.headline
    : null;

  return (
    <div id={`tool-${part.id}`} className="tool" data-shape={part.shape} data-status={part.status} data-open={open} data-images={hasImages || undefined}>
      <button className="tool-head" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ChevronRight size={12} className="tool-chevron" aria-hidden="true" />
        <span className="tool-icon">
          <Icon size={12} aria-hidden="true" />
        </span>
        <span className="tool-name" title={label}>{label}</span>
        {fileShape && part.headline
          ? <span className="tool-file" title={part.headline}><FileIcon path={part.headline} size={13} /><span className="truncate">{part.headline.split(/[\\/]/).at(-1)}</span></span>
          : <span className="tool-headline truncate" title={part.headline}>{part.headline}</span>}
        <span className="tool-meta">
          {part.detail && !fileShape && <span className="tool-detail truncate" title={part.detail}>{part.detail}</span>}
          {part.patch && (
            <LineCounts added={part.patch.added} removed={part.patch.removed} />
          )}
          {elapsed !== null && elapsed >= 500 && <span className="tool-time">{duration(elapsed)}</span>}
          <StatusMark status={part.status} />
        </span>
      </button>

      <Collapsible open={open} className="tool-body">
        <div className="tool-body-inner">
          {command && <pre className="tool-output">{command}</pre>}
          {url && (
            <a className="tool-url truncate" href={url} target="_blank" rel="noreferrer noopener">
              {url}
              <ExternalLink size={11} />
            </a>
          )}
          {part.patch && <DiffView patch={part.patch} showHeader={false} partId={part.id} />}
          {!part.patch && output && <Output text={output} shape={part.shape} partId={part.id} />}
          {!part.patch && !output && !hasImages && part.status === "running" && (
            <div className="tool-waiting">
              <PixelLoader size={12} />
              Running
            </div>
          )}
          {!part.patch && !output && !hasImages && part.status !== "running" && (
            <div className="tool-empty">No output</div>
          )}
        </div>
      </Collapsible>
      {hasImages && <ImageStrip part={part} compact={!open} />}
    </div>
  );
}

function StatusMark({ status }: { status: ToolPart["status"] }) {
  if (status === "running") return <PixelLoader size={12} className="tool-spin" role="img" aria-label="running" />;
  if (status === "ok") return null;
  if (status === "denied") return <Ban size={12} className="tool-bad" aria-label="denied" />;
  return <AlertTriangle size={12} className="tool-bad" aria-label="failed" />;
}

function Output({ text, shape, partId }: { text: string; shape: ToolPart["shape"]; partId: string }) {
  const [expanded, setExpanded] = useDisclosure(partId, "output");
  const lines = useMemo(() => text.split("\n"), [text]);
  const cap = shape === "command" ? 18 : 14;
  const shown = expanded ? lines.length : Math.min(lines.length, cap);
  const hidden = lines.length - shown;
  const html = useMemo(() => ansiToHtml(lines.slice(0, shown).join("\n")), [lines, shown]);

  return (
    <>
      <pre className="tool-output" dangerouslySetInnerHTML={{ __html: html }} />
      {hidden > 0 && (
        <button className="diff-more" type="button" onClick={() => setExpanded(true)}>
          Show {hidden} more {hidden === 1 ? "line" : "lines"}
        </button>
      )}
    </>
  );
}
