export const REACTIONS = [
  { key: "like", label: "Thumbs up" },
  { key: "dislike", label: "Thumbs down" },
  { key: "love", label: "Heart" },
  { key: "done", label: "Check mark" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

export interface Reaction {
  key: ReactionKey;
  at: number;
}

export function reactionLabel(key: ReactionKey): string {
  return REACTIONS.find((reaction) => reaction.key === key)!.label;
}

export function checkReaction(key: unknown): ReactionKey {
  if (!REACTIONS.some((reaction) => reaction.key === key))
    throw new Error("Choose one of the listed reactions.");
  return key as ReactionKey;
}
