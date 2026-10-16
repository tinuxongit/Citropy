import type { BrowserTab } from "./tab.ts";

interface RemoteObject {
  type: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
}

// CDP event parameters differ per method, so each logger reads the fields its event defines.
type EventParams = Record<string, any>;

function remoteText(value: RemoteObject) {
  if (value.type === "string") return value.value;
  if ("value" in value) return JSON.stringify(value.value);
  return value.unserializableValue ?? value.description ?? value.type;
}

// console.log("%cStyled", "color: red") passes one style argument per %c, which the log skips.
function consoleMessage(args: RemoteObject[]) {
  const texts = args.map(remoteText);
  const first = texts[0];
  const styles = typeof first === "string" ? (first.match(/%c/g) ?? []).length : 0;
  return [String(first ?? "").replaceAll("%c", ""), ...texts.slice(1 + styles)].join(" ").trim();
}

const loggers: Record<string, (tab: BrowserTab, params: EventParams) => void> = {
  "Runtime.consoleAPICalled": (tab, params) => {
    const message = consoleMessage(params.args);
    if (!message.startsWith("Electron Security Warning")) tab.log("console", params.type, message);
  },
  "Runtime.exceptionThrown": (tab, { exceptionDetails }) => {
    tab.log("exception", "error", exceptionDetails.exception?.description ?? exceptionDetails.text);
  },
  "Log.entryAdded": (tab, { entry }) => {
    if (entry.source === "network" || !["error", "warning"].includes(entry.level)) return;
    tab.log("browser", entry.level, entry.url ? `${entry.text} (${entry.url})` : entry.text);
  },
  "Network.requestWillBeSent": (tab, params) => {
    tab.rememberRequest(params.requestId, params.request.url);
  },
  "Network.responseReceived": (tab, { response }) => {
    if (response.status >= 400) tab.log("network", "error", `${response.status} ${response.url}`);
  },
  "Network.loadingFailed": (tab, params) => {
    if (params.canceled) return;
    const url = tab.requestUrl(params.requestId) ?? "";
    tab.log("network", "error", `${params.errorText} ${url}`.trim());
  },
};

// Records console output, page errors and failed requests for the browser_logs tool.
export function logDevtoolsEvent(tab: BrowserTab, method: string, params: EventParams) {
  if (Object.hasOwn(loggers, method)) loggers[method]!(tab, params);
}

// Returns the log, emptying it unless the caller asks to keep it.
export function takeLogs(tab: BrowserTab, clear: boolean | undefined) {
  const entries = tab.logs.slice();
  if (clear !== false) tab.logs.length = 0;
  return entries;
}
