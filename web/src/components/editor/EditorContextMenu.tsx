import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { reportError } from "../../lib/api.ts";
import { copyText } from "../../lib/copy-text.ts";
import { MOD } from "../../lib/modifier-key.ts";
import { sendToComposer } from "../../lib/composer-inbox.ts";
import { monaco } from "./monaco.ts";
import type { TextDocument } from "./documents.ts";
import { selectionForChat } from "./selection-for-chat.ts";

interface Item {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => unknown;
}

function clipboardItems(editor: monaco.editor.IStandaloneCodeEditor): Item[] {
  const model = editor.getModel()!;
  const selection = editor.getSelection()!;
  const empty = selection.isEmpty();
  const readOnly = editor.getOption(monaco.editor.EditorOption.readOnly);
  const replaceSelection = (text: string) => editor.executeEdits("context-menu", [{ range: editor.getSelection()!, text, forceMoveMarkers: true }]);
  return [
    {
      id: "cut",
      label: "Cut",
      shortcut: `${MOD}X`,
      disabled: empty || readOnly,
      run: async () => {
        await copyText(model.getValueInRange(selection));
        replaceSelection("");
      },
    },
    {
      id: "copy",
      label: "Copy",
      shortcut: `${MOD}C`,
      disabled: empty,
      run: () => copyText(model.getValueInRange(selection)),
    },
    {
      id: "paste",
      label: "Paste",
      shortcut: `${MOD}V`,
      disabled: readOnly,
      run: async () => {
        if (!navigator.clipboard) throw new Error(`Could not read the clipboard here. Paste with ${MOD}V instead.`);
        replaceSelection(await navigator.clipboard.readText());
      },
    },
  ];
}

export function EditorContextMenu({ editor, file, threadId, x, y, onClose }: {
  editor: monaco.editor.IStandaloneCodeEditor;
  file: TextDocument;
  threadId?: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const format = editor.getAction("editor.action.formatDocument");
  const selection = editor.getSelection()!;
  const groups: Item[][] = [
    ...(threadId && !selection.isEmpty()
      ? [[{ id: "chat", label: "Add to chat", run: () => sendToComposer(threadId, { text: selectionForChat(selection, file), attachments: [], placement: "after" }) }]]
      : []),
    clipboardItems(editor),
    [
      { id: "select", label: "Select all", shortcut: `${MOD}A`, run: () => editor.trigger("context-menu", "editor.action.selectAll", null) },
      { id: "find", label: "Find and replace", shortcut: `${MOD}F`, run: () => editor.trigger("context-menu", "editor.action.startFindReplaceAction", null) },
      ...(format?.isSupported() ? [{ id: "format", label: "Format document", run: () => format.run() }] : []),
    ],
  ];

  useLayoutEffect(() => {
    const element = menu.current!;
    element.showPopover();
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const choose = (item: Item) => {
    onClose();
    editor.focus();
    void Promise.resolve(item.run()).catch(reportError);
  };

  const navigate = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      editor.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons.at((index + (event.key === "ArrowDown" ? 1 : -1)) % buttons.length)?.focus();
  };

  return (
    <div ref={menu} className="menu editor-context-menu" popover="manual" role="menu" aria-label="Editor actions" onKeyDown={navigate}>
      {groups.map((items, index) => (
        <div className="editor-context-group" role="group" key={index}>
          {items.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu-item" disabled={item.disabled} onClick={() => choose(item)}>
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
