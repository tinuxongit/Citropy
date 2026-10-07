import { useEffect, useRef, type RefObject } from "react";
import { OPEN_OVERLAYS } from "../../lib/overlays.ts";
import { useTouchInput } from "../../lib/use-touch-input.ts";

const PASTE_ATTACHMENT_BYTES = 32 * 1024;
const PASTED_TEXT_NAME = "pasted-text.txt";

const TEXT_FIELDS = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(",");

const OWNS_TYPING = [
  TEXT_FIELDS,
  '[role="menuitem"]',
  '[role="option"]',
].join(",");

function redirectsToComposer(event: Event): boolean {
  const target = event.target;
  const inChat = target === document.body || (target instanceof Element && target.closest(".stage") !== null && target.closest(OWNS_TYPING) === null);
  return !event.defaultPrevented && inChat && document.querySelector(OPEN_OVERLAYS) === null;
}

function returnsToComposer(active: Element | null): boolean {
  return active?.closest(TEXT_FIELDS) == null && document.querySelector(OPEN_OVERLAYS) === null;
}

function pastedFiles(data: DataTransfer, inline: boolean): File[] {
  const files = Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (files.length || inline) return files;
  const text = data.getData("text/plain");
  return new Blob([text]).size >= PASTE_ATTACHMENT_BYTES ? [new File([text], PASTED_TEXT_NAME, { type: "text/plain" })] : [];
}

export function useTypeToFocus({
  box,
  disabled,
  onFiles,
}: {
  box: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const touch = useTouchInput();
  const latestOnFiles = useRef(onFiles);
  latestOnFiles.current = onFiles;
  const inlinePaste = useRef(false);
  useEffect(() => {
    if (disabled) return;
    const insert = (text: string) => {
      const node = box.current!;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
      document.execCommand("insertText", false, text);
    };
    const onKey = (event: KeyboardEvent) => {
      inlinePaste.current = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v";
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.key === " " || !redirectsToComposer(event)) return;
      event.preventDefault();
      insert(event.key);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData || !redirectsToComposer(event)) return;
      const files = pastedFiles(event.clipboardData, inlinePaste.current);
      const text = event.clipboardData.getData("text/plain");
      if (!files.length && !text) return;
      event.preventDefault();
      if (files.length) latestOnFiles.current(files);
      else insert(text);
    };
    let frame = 0;
    const onWindowFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (returnsToComposer(document.activeElement)) box.current?.focus();
        });
      });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    if (!touch) window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("focus", onWindowFocus);
      cancelAnimationFrame(frame);
    };
  }, [disabled, touch]);
  return (data: DataTransfer) => pastedFiles(data, inlinePaste.current);
}
