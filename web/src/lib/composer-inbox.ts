import type { Attachment } from "../../../shared/protocol.ts";

export type ComposerDelivery = { text: string; attachments: Attachment[]; placement: "before" | "after" };

const waiting = new Map<string, ComposerDelivery[]>();
const listeners = new Set<() => void>();

export function sendToComposer(threadId: string, delivery: ComposerDelivery): void {
  waiting.set(threadId, [...(waiting.get(threadId) ?? []), delivery]);
  for (const listener of listeners) listener();
}

export function attachToComposer(threadId: string, attachment: Attachment): void {
  sendToComposer(threadId, { text: "", attachments: [attachment], placement: "after" });
}

export function takeComposerDeliveries(threadId: string): ComposerDelivery[] {
  const deliveries = waiting.get(threadId) ?? [];
  waiting.delete(threadId);
  return deliveries;
}

export function onComposerDelivery(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
