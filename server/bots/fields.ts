import { uid } from "../ids.ts";
import { store } from "../store.ts";

export function text(value: unknown, label: string, max: number, allowEmpty = true): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${label} cannot be empty.`);
  if (trimmed.length > max) throw new Error(`${label} can be at most ${max} characters.`);
  return trimmed;
}

export function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be on or off.`);
  return value;
}

export function addNotice(threadId: string, line: string): void {
  store.addMessage(threadId, { id: uid("msg"), role: "system", ts: Date.now(), parts: [{ id: uid("prt"), kind: "notice", level: "info", text: line }] });
}
