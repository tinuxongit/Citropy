import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { reportError } from "../../lib/api.ts";
import { useI18n } from "../../lib/i18n.ts";
import { monaco } from "./monaco.ts";

const MOD = navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl+";

interface Item {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => unknown;
}

function clipboardItems(editor: monaco.editor.IStandaloneCodeEditor, t: (text: string) => string): Item[] {
  const model = editor.getModel()!;
  const selection = editor.getSelection()!;
  const empty = selection.isEmpty();
  const readOnly = editor.getOption(monaco.editor.EditorOption.readOnly);
  const replaceSelection = (text: string) => editor.executeEdits("context-menu", [{ range: editor.getSelection()!, text, forceMoveMarkers: true }]);
  return [
    {
      id: "cut",
      label: t("Cut"),
      shortcut: `${MOD}X`,
      disabled: empty || readOnly,
      run: async () => {
        await navigator.clipboard.writeText(model.getValueInRange(selection));
        replaceSelection("");
      },
    },
    {
      id: "copy",
      label: t("Copy"),
      shortcut: `${MOD}C`,
      disabled: empty,
      run: () => navigator.clipboard.writeText(model.getValueInRange(selection)),
    },
    {
      id: "paste",
      label: t("Paste"),
      shortcut: `${MOD}V`,
      disabled: readOnly,
      run: async () => { replaceSelection(await navigator.clipboard.readText()); },
    },
  ];
}

export function EditorContextMenu({ editor, x, y, onClose }: {
  editor: monaco.editor.IStandaloneCodeEditor;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const t = useI18n();
  const menu = useRef<HTMLDivElement>(null);
  const format = editor.getAction("editor.action.formatDocument");
  const groups: Item[][] = [
    clipboardItems(editor, t),
    [
      { id: "select", label: t("Select all"), shortcut: `${MOD}A`, run: () => editor.trigger("context-menu", "editor.action.selectAll", null) },
      { id: "find", label: t("Find and replace"), shortcut: `${MOD}F`, run: () => editor.trigger("context-menu", "editor.action.startFindReplaceAction", null) },
      ...(format?.isSupported() ? [{ id: "format", label: t("Format document"), run: () => format.run() }] : []),
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
    <div ref={menu} className="menu editor-context-menu" popover="manual" role="menu" aria-label={t("Editor actions")} onKeyDown={navigate}>
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
