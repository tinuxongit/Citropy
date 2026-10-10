import { createContext, useContext, type ReactNode } from "react";
import { DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode } from "lexical";

export type MentionLook = { label: string; icon: ReactNode };

export const MentionLooks = createContext<ReadonlyMap<string, MentionLook>>(new Map());

type SerializedMentionNode = SerializedLexicalNode & { name: string };

function MentionChip({ name }: { name: string }) {
  const look = useContext(MentionLooks).get(name);
  if (!look) return `@${name}`;
  return <>{look.icon}{look.label}</>;
}

export class MentionNode extends DecoratorNode<ReactNode> {
  __name: string;

  static getType() {
    return "mention";
  }

  static clone(node: MentionNode) {
    return new MentionNode(node.__name, node.__key);
  }

  static importJSON(json: SerializedMentionNode) {
    return $createMentionNode(json.name);
  }

  constructor(name: string, key?: NodeKey) {
    super(key);
    this.__name = name;
  }

  exportJSON(): SerializedMentionNode {
    return { ...super.exportJSON(), name: this.__name };
  }

  getName() {
    return this.__name;
  }

  createDOM() {
    const chip = document.createElement("span");
    chip.className = "mention-chip";
    return chip;
  }

  updateDOM() {
    return false;
  }

  getTextContent() {
    return `@${this.__name}`;
  }

  isInline() {
    return true;
  }

  decorate() {
    return <MentionChip name={this.__name} />;
  }
}

export function $createMentionNode(name: string) {
  return new MentionNode(name);
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
