import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
  type ParagraphNode,
  type TextNode,
} from "lexical";
import { $createMentionNode, type MentionNode } from "./mention-node.tsx";

const MENTION = /(?:^|\s)@([\w.:-]+)(?![\w./:-])/g;

function $sizeBefore(node: LexicalNode): number {
  let size = 0;
  for (let current: LexicalNode | null = node; current && !$isRootNode(current); current = current.getParent()) {
    for (const sibling of current.getPreviousSiblings()) size += sibling.getTextContentSize();
  }
  return size;
}

export function $messageText(): string {
  return $getRoot().getTextContent();
}

export function $messageCaret(): number {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return $messageText().length;
  const point = selection.isBackward() ? selection.focus : selection.anchor;
  const node = point.getNode();
  if (point.type === "text") return $sizeBefore(node) + point.offset;
  const children = (node as ElementNode).getChildren().slice(0, point.offset);
  return $sizeBefore(node) + children.reduce((size, child) => size + child.getTextContentSize(), 0);
}

function $selectOffset(paragraph: ParagraphNode, caret: number) {
  let before = 0;
  for (const [index, child] of paragraph.getChildren().entries()) {
    const size = child.getTextContentSize();
    if ($isTextNode(child) && caret <= before + size) {
      child.select(caret - before, caret - before);
      return;
    }
    if (caret <= before) {
      paragraph.select(index, index);
      return;
    }
    before += size;
  }
  paragraph.selectEnd();
}

export function $setMessage(text: string, caret?: number) {
  const paragraph = $createParagraphNode();
  text.split("\n").forEach((line, index) => {
    if (index) paragraph.append($createLineBreakNode());
    if (line) paragraph.append($createTextNode(line));
  });
  $getRoot().clear().append(paragraph);
  if (caret === undefined) $setSelection(null);
  else $selectOffset(paragraph, caret);
}

function $caretIn(node: TextNode): number | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.key !== node.getKey()) return undefined;
  return selection.anchor.offset;
}

function $startsLine(node: TextNode): boolean {
  const previous = node.getPreviousSibling();
  return previous === null || $isLineBreakNode(previous);
}

export function $chipMentions(node: TextNode, known: (name: string) => boolean) {
  const text = node.getTextContent();
  const caret = $caretIn(node);
  for (const match of text.matchAll(MENTION)) {
    const name = match[1]!;
    const start = match.index + match[0].indexOf("@");
    const end = match.index + match[0].length;
    if (!known(name) || (caret !== undefined && caret >= start && caret <= end)) continue;
    if (start === 0 && !$startsLine(node)) continue;
    const parts = node.splitText(start, end);
    parts[start === 0 ? 0 : 1]!.replace($createMentionNode(name));
    return;
  }
}

export function $unchipMention(node: MentionNode, known: (name: string) => boolean) {
  if (!known(node.getName())) node.replace($createTextNode(node.getTextContent()));
}

export function $markMessageDirty() {
  for (const block of $getRoot().getChildren<ElementNode>()) {
    for (const child of block.getChildren()) child.markDirty();
  }
}
