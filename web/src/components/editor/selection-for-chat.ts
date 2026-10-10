import { contextReference } from "../../../../shared/context.ts";
import type { monaco } from "./monaco.ts";
import type { TextDocument } from "./documents.ts";

function selectedLines(selection: monaco.Selection): [number, number] {
  const start = selection.startLineNumber;
  const endsAtLineStart = selection.endColumn === 1 && selection.endLineNumber > start;
  return [start, endsAtLineStart ? selection.endLineNumber - 1 : selection.endLineNumber];
}

export function selectionForChat(selection: monaco.Selection, document: Pick<TextDocument, "path" | "dirty" | "model">): string {
  const [start, end] = selectedLines(selection);
  if (!document.dirty) return `${contextReference(document.path)}${start === end ? `#L${start}` : `#L${start}-L${end}`}`;
  const code = document.model.getValueInRange(selection).replace(/\n$/, "");
  const fence = "`".repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((run) => run[0].length + 1)));
  const lines = start === end ? `line ${start}` : `lines ${start}-${end}`;
  return `Unsaved ${lines} of ${document.path}:\n${fence}${document.model.getLanguageId()}\n${code}\n${fence}`;
}
