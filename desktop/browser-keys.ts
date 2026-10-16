import type { KeyboardInputEvent, WebContents } from "electron";

// Keys go through Electron's sendInputEvent, which reaches only this page.
// CDP key and text input on a <webview> lands in whatever has focus in the
// window, such as the chat composer the user is typing in.
const keyCodes: Record<string, string> = {
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Escape: "Escape",
  ArrowLeft: "Left",
  ArrowUp: "Up",
  ArrowRight: "Right",
  ArrowDown: "Down",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Space: "Space",
};
type Modifier = NonNullable<KeyboardInputEvent["modifiers"]>[number];

const modifierNames: Record<string, Modifier> = { Control: "control", Meta: "meta", Alt: "alt", Shift: "shift" };

export function keyEvents(combo: string): KeyboardInputEvent[] {
  const keys = combo.split("+");
  const key = keys.pop() ?? "";
  const keyCode = keyCodes[key] ?? (key.length === 1 ? key : undefined);
  if (!keyCode || keys.some((modifier) => !modifierNames[modifier]))
    throw new Error("Use a standard key name such as Enter, Tab, ArrowDown, or Control+A");
  const modifiers = keys.map((modifier) => modifierNames[modifier]!);
  const text = modifiers.some((modifier) => modifier !== "shift")
    ? undefined
    : key === "Enter" ? "\r" : key === "Space" ? " " : key.length === 1 ? key : undefined;
  return [
    { type: "keyDown", keyCode, modifiers },
    ...(text ? [{ type: "char" as const, keyCode: text, modifiers }] : []),
    { type: "keyUp", keyCode, modifiers },
  ];
}

export function pressKey(content: WebContents, combo: string) {
  for (const event of keyEvents(combo)) content.sendInputEvent(event);
}
