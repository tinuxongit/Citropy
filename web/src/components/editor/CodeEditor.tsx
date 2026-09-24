import { useI18n } from "../../lib/i18n.ts";
import { useEffect, useRef, useState } from "react";
import { useApp, scaled } from "../../lib/store.ts";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";
import { monaco } from "./monaco.ts";
import { saveDocument, type TextDocument } from "./documents.ts";

export function CodeEditor({
  document,
  wrap,
  onReady,
}: {
  document: TextDocument;
  wrap: boolean;
  onReady: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
}) {
  const t = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const current = useRef(document);
  const theme = useApp((state) => state.theme);
  const scale = useApp((state) => state.uiScale);
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const [problems, setProblems] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    const editor = monaco.editor.create(container.current, {
      model: null,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: getComputedStyle(container.current).getPropertyValue("--font-mono").trim(),
      fontSize: scaled(13),
      lineHeight: scaled(22),
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      smoothScrolling: false,
      fixedOverflowWidgets: true,
      accessibilitySupport: "auto",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      tabSize: 2,
      ariaLabel: "Code editor",
    });
    instance.current = editor;
    onReady(editor);
    const save = editor.addAction({
      id: "citropy.save",
      label: "Save file",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveDocument(current.current),
    });
    const cursor = editor.onDidChangeCursorPosition((event) =>
      setPosition(event.position),
    );
    return () => {
      current.current.view = editor.saveViewState();
      save.dispose();
      cursor.dispose();
      editor.dispose();
      instance.current = null;
      onReady(null);
    };
  }, [onReady]);

  useEffect(() => {
    const editor = instance.current;
    if (!editor) return;
    if (current.current !== document)
      current.current.view = editor.saveViewState();
    current.current = document;
    editor.setModel(document.model);
    editor.restoreViewState(document.view);
    editor.updateOptions({ ariaLabel: `Code editor: ${document.path}` });
    setPosition(editor.getPosition() ?? { lineNumber: 1, column: 1 });
    const refresh = () =>
      setProblems(
        monaco.editor.getModelMarkers({ resource: document.model.uri }).length,
      );
    refresh();
    const listener = monaco.editor.onDidChangeMarkers(refresh);
    editor.focus();
    return () => listener.dispose();
  }, [document]);

  useEffect(() => {
    if (!container.current) return;
    const colors = getComputedStyle(container.current);
    const name = `citropy-${theme}`;
    monaco.editor.defineTheme(name, {
      base: theme === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": colors.getPropertyValue("--canvas").trim(),
        "editorGutter.background": colors.getPropertyValue("--canvas").trim(),
        "editor.lineHighlightBackground": colors.getPropertyValue("--panel").trim(),
        "editor.lineHighlightBorder": "#00000000",
      },
    });
    monaco.editor.setTheme(name);
  }, [theme]);

  useEffect(() => {
    instance.current?.updateOptions({
      wordWrap: wrap ? "on" : "off",
      fontSize: scaled(13),
      lineHeight: scaled(22),
      readOnly: document.saving,
      smoothScrolling: !reducedMotion,
    });
  }, [wrap, scale, document.saving, reducedMotion]);

  return (
    <>
      <div className="code-editor-surface" ref={container} />
      <div className="editor-status">
        <span>
          {t(
            document.saving
              ? "Saving…"
              : document.dirty
                ? "Unsaved changes"
                : "Saved",
          )}
        </span>
        <button
          type="button"
          onClick={() =>
            instance.current?.trigger(
              "toolbar",
              "editor.action.marker.nextInFiles",
              null,
            )
          }
          title={t("Go to next problem")}
        >
          {t("{count} problems", { count: problems })}
        </button>
        <span className="editor-status-position">
          {t("Ln {line}, Col {column}", {
            line: position.lineNumber,
            column: position.column,
          })}
        </span>
        <span>{document.model.getLanguageId()}</span>
        <span>
          UTF-8 · {document.model.getEOL() === "\r\n" ? "CRLF" : "LF"}
        </span>
      </div>
    </>
  );
}
