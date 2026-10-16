import type { HandlerDetails, WebContents, WindowOpenHandlerResponse } from "electron";
import { logFailure } from "../../shared/expected-errors.mjs";
import { applyMobileMode, applyViewport } from "./emulation.ts";
import { logDevtoolsEvent } from "./logs.ts";
import { asWebAddress, load, NAVIGATION_ABORTED } from "./navigation.ts";
import type { BrowserTab } from "./tab.ts";

// Network events feed the log only, so no request or response bodies are kept.
const NETWORK_LOGGING = { maxTotalBufferSize: 0, maxResourceBufferSize: 0, maxPostDataSize: 0 };
// Attach to out-of-process iframes as flat sessions on the same debugger.
const AUTO_ATTACH = { autoAttach: true, waitForDebuggerOnStart: false, flatten: true };
const FRAME_DOMAINS = [
  ["Runtime.enable", {}],
  ["Log.enable", {}],
  ["Network.enable", NETWORK_LOGGING],
  ["Target.setAutoAttach", AUTO_ATTACH],
] as const;
const SIGN_IN_POPUP = { width: 520, height: 640, autoHideMenuBar: true };

// Sets up the <webview> the renderer attached for a tab, then loads the tab's page in it.
export async function setUpGuest(tab: BrowserTab, content: WebContents, closing: () => boolean) {
  const url = tab.state.url;
  tab.contents = content;
  tab.viewport = {};
  tab.frames.clear();
  content.setZoomFactor(1);
  publishPageChanges(tab, content);
  releaseWhenDestroyed(tab, content, closing);
  guardNavigation(tab, content);
  routeAddressShortcut(tab, content);
  content.debugger.on("message", (_, method, params) => handleDevtoolsEvent(tab, method, params));
  await enableDevtools(tab);
  tab.activity.reattached();
  await tab.activity.run(async () => {
    await applyViewport(tab);
    await applyMobileMode(tab);
    await Promise.all([load(content, url), tab.cdp("Page.enable")]);
  });
  tab.publish();
}

function publishPageChanges(tab: BrowserTab, content: WebContents) {
  for (const event of [
    "did-start-loading",
    "did-stop-loading",
    "did-navigate",
    "did-navigate-in-page",
    "page-title-updated",
  ] as const)
    content.on(event as "did-start-loading", () => tab.publish());
  content.on("did-fail-load", (_, code, description, __, mainFrame) => {
    if (!mainFrame || code === NAVIGATION_ABORTED) return;
    tab.state.error = description;
    tab.publish();
  });
  content.on("render-process-gone", () => {
    tab.state.error = "This page stopped responding. Reload it to continue.";
    tab.publish();
  });
}

function releaseWhenDestroyed(tab: BrowserTab, content: WebContents, closing: () => boolean) {
  content.once("destroyed", () => {
    if (tab.contents !== content) return;
    tab.contents = undefined;
    if (!closing() && tab.host.isOpen(tab)) tab.awaitNewGuest();
  });
}

// Pages stay on http and https. Links that open a new tab become Citropy browser tabs.
function guardNavigation(tab: BrowserTab, content: WebContents) {
  content.on("will-navigate", (event, url) => {
    if (!asWebAddress(url)) event.preventDefault();
  });
  content.setWindowOpenHandler((details) => openWindow(tab, details));
}

function openWindow(
  tab: BrowserTab,
  { url, disposition }: HandlerDetails,
): WindowOpenHandlerResponse {
  const address = asWebAddress(url);
  const deny: WindowOpenHandlerResponse = { action: "deny" };
  // Sign-in popups (Google, Apple, SSO) open through window.open with window features,
  // which Electron reports as the "new-window" disposition. They need a real child
  // window that keeps window.opener live so the provider can post the result back.
  // Denying them makes window.open return null and the sign-in fails. The child
  // inherits this tab's session, so its cookies match.
  if (disposition === "new-window") {
    if (!address) return deny;
    return { action: "allow", overrideBrowserWindowOptions: SIGN_IN_POPUP };
  }
  if (address) {
    tab.host.emit({ t: "browser.popup", parentId: tab.id, url: address });
    tab.log("tab", "info", `Opened ${address} in a new tab`);
  }
  return deny;
}

// Ctrl+L or Cmd+L inside the page focuses Citropy's address bar, as in a browser.
function routeAddressShortcut(tab: BrowserTab, content: WebContents) {
  content.on("before-input-event", (event, input) => {
    if (!(input.control || input.meta) || input.key.toLowerCase() !== "l") return;
    event.preventDefault();
    const ui = tab.host.window.webContents;
    ui.focus();
    ui.send("browser:address", tab.id);
  });
}

// CDP event parameters differ per method, so each branch reads the fields its event defines.
function handleDevtoolsEvent(tab: BrowserTab, method: string, params: Record<string, any>) {
  logDevtoolsEvent(tab, method, params);
  if (method === "Target.attachedToTarget") frameAttached(tab, params);
  else if (method === "Target.detachedFromTarget") tab.frames.remove(params.sessionId);
  else if (method === "Page.javascriptDialogOpening") {
    tab.state.dialog = { type: params.type, message: params.message };
    tab.publish();
  } else if (method === "Page.javascriptDialogClosed") {
    tab.state.dialog = undefined;
    tab.publish();
  }
}

function frameAttached(tab: BrowserTab, params: Record<string, any>) {
  if (params.targetInfo.type !== "iframe") return;
  tab.frames.add({ sessionId: params.sessionId, targetId: params.targetInfo.targetId });
  for (const [method, options] of FRAME_DOMAINS)
    void tab
      .cdp(method, options, params.sessionId)
      .catch(logFailure(`Browser frame ${method}`, tab.id));
}

async function enableDevtools(tab: BrowserTab) {
  await Promise.all([
    tab.cdp("Runtime.enable"),
    tab.cdp("Log.enable"),
    tab.cdp("Network.enable", NETWORK_LOGGING),
  ]);
  await tab.cdp("Target.setAutoAttach", AUTO_ATTACH);
  await tab.cdp("DOM.enable");
  await tab.cdp("Overlay.enable");
}
