import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

const SCRIPT_WORKER_IDLE_MS = 2 * 60 * 1000;

const scriptWorkers = {
  typescript: monaco.typescript.typescriptDefaults,
  javascript: monaco.typescript.javascriptDefaults,
};
let scriptIdleTimer: ReturnType<typeof setTimeout> | undefined;

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(label)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(label))
      return new HtmlWorker();
    if (["typescript", "javascript"].includes(label))
      return new TypeScriptWorker();
    return new EditorWorker();
  },
};

function stopIdleScriptWorkers(): void {
  const languages = new Set(monaco.editor.getModels().map((model) => model.getLanguageId()));
  for (const [language, defaults] of Object.entries(scriptWorkers))
    // Why: Monaco never stops its TypeScript workers when idle, and re-setting the options is the public call that disposes them.
    if (!languages.has(language)) defaults.setWorkerOptions(defaults.workerOptions);
}

monaco.editor.onWillDisposeModel(() => {
  clearTimeout(scriptIdleTimer);
  scriptIdleTimer = setTimeout(stopIdleScriptWorkers, SCRIPT_WORKER_IDLE_MS);
});

export { monaco };
