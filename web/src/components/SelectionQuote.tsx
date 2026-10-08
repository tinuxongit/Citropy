import { useEffect, useState, type RefObject } from "react";
import { QuoteIcon } from "./icons/editing.tsx";
import { sendToComposer } from "../lib/composer-inbox.ts";

const GAP = 8;
const EDGE_MARGIN = 48;
const ABOVE_CLEARANCE = 72;

type Spot = { x: number; y: number; above: boolean; text: string };

function selectionInside(node: HTMLElement): Selection | undefined {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return undefined;
  return node.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection : undefined;
}

function quoted(text: string): string {
  const lines = text.trim().split("\n").map((line) => line.trim() ? `> ${line}` : ">");
  return `${lines.join("\n")}\n\n`;
}

export function SelectionQuote({ viewport, threadId }: { viewport: RefObject<HTMLElement | null>; threadId: string }) {
  const [spot, setSpot] = useState<Spot>();

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    let timer = 0;
    const hide = () => setSpot(undefined);
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const selection = selectionInside(node);
        if (!selection) return hide();
        const bounds = node.getBoundingClientRect();
        const top = selection.getRangeAt(0).getBoundingClientRect().top - bounds.top;
        const above = top > ABOVE_CLEARANCE;
        setSpot({
          x: Math.min(Math.max(event.clientX - bounds.left, EDGE_MARGIN), bounds.width - EDGE_MARGIN),
          y: above ? top - GAP : event.clientY - bounds.top + GAP,
          above,
          text: selection.toString(),
        });
      });
    };
    const onSelectionChange = () => {
      if (!selectionInside(node)) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("scroll", hide, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("scroll", hide);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [viewport]);

  if (!spot) return null;
  return (
    <button
      type="button"
      className="selection-quote"
      data-above={spot.above || undefined}
      style={{ left: spot.x, top: spot.y }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        sendToComposer(threadId, { text: quoted(spot.text), attachments: [], placement: "after" });
        document.getSelection()?.removeAllRanges();
        setSpot(undefined);
      }}
    >
      <QuoteIcon size={13} aria-hidden="true" />
      Quote
    </button>
  );
}
