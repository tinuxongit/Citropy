import type { BrowserWindow, WebContents } from "electron";
import type { BrowserState } from "../../shared/workbench.ts";
import { browserActivity } from "./activity.ts";
import { createPointer } from "./pointer.ts";
import { FrameSessions } from "./frame-sessions.ts";
import type { LogEntry } from "./types.ts";

const MAX_LOG_ENTRIES = 300;
const MAX_LOG_TEXT = 2000;
const MAX_TRACKED_REQUESTS = 500;

// What a tab needs from the window and the registry that own it.
export interface TabHost {
  window: BrowserWindow;
  emit: (event: object) => void;
  activeEnvironment: () => string | undefined;
  accountOf: (profileId: string | undefined) => BrowserState["account"];
  isOpen: (tab: BrowserTab) => boolean;
  publishGuests: () => void;
}

// The device metrics last sent to the page, so an unchanged size is not sent again.
export interface ViewportOverride {
  key?: string;
  params?: Record<string, unknown>;
  applied?: Promise<unknown>;
}

// Settles once the renderer's <webview> for the tab is attached and set up.
export interface GuestAttachment {
  ready: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

function guestAttachment(): GuestAttachment {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((onReady, onFailed) => {
    resolve = onReady;
    reject = onFailed;
  });
  // A tab can close before anything waits on it. Callers that await `ready` still see the error.
  ready.catch(() => {});
  return { ready, resolve, reject };
}

// One browser tab. The renderer shows its page in a <webview>, and Citropy drives that
// page through the Chrome DevTools Protocol.
export class BrowserTab {
  readonly host: TabHost;
  readonly partition: string;
  readonly state: BrowserState;
  readonly activity: ReturnType<typeof browserActivity>;
  readonly pointer: ReturnType<typeof createPointer>;
  readonly frames = new FrameSessions();
  readonly logs: LogEntry[] = [];
  readonly media = { colorScheme: "", reducedMotion: "" };
  readonly #requestUrls = new Map<string, string>();
  contents: WebContents | undefined;
  attachment = guestAttachment();
  viewport: ViewportOverride = {};
  // Whether the renderer shows this tab, and the zoom it shows it at.
  visible = false;
  scale = 1;

  constructor(host: TabHost, partition: string, state: BrowserState) {
    this.host = host;
    this.partition = partition;
    this.state = state;
    this.activity = browserActivity(host.publishGuests, (enabled) => this.#emulateFocus(enabled));
    this.pointer = createPointer(
      (method, params) => this.cdp(method, params),
      () => this.onScreen,
      () => Boolean(this.state.mobile),
      () => this.scale,
    );
  }

  get id() {
    return this.state.id;
  }

  // Whether the user can see this tab right now.
  get onScreen() {
    const { window } = this.host;
    return this.visible && window.isVisible() && !window.isMinimized();
  }

  page() {
    if (!this.contents || this.contents.isDestroyed())
      throw new Error("This browser tab is reconnecting. Try again.");
    return this.contents;
  }

  cdp(method: string, params: object = {}, sessionId?: string) {
    const debuggerApi = this.page().debugger;
    if (!debuggerApi.isAttached()) debuggerApi.attach("1.3");
    return sessionId
      ? debuggerApi.sendCommand(method, params, sessionId)
      : debuggerApi.sendCommand(method, params);
  }

  // Pointer and keyboard input only reach the page through the local window, and a
  // pending resize must land before coordinates mean anything.
  async prepareForInput() {
    const active = this.host.activeEnvironment();
    if (active && active !== "local")
      throw new Error("Switch to Local to use desktop browser tools.");
    await this.viewport.applied;
  }

  currentState(): BrowserState {
    const account = this.host.accountOf(this.state.profileId);
    const content = this.contents;
    if (!content || content.isDestroyed()) return { ...this.state, loading: true, account };
    const url = content.getURL() || "about:blank";
    return {
      ...this.state,
      url,
      title: url === "about:blank" ? "Browser" : content.getTitle() || "Browser",
      loading: content.isLoadingMainFrame(),
      canGoBack: content.navigationHistory.canGoBack(),
      canGoForward: content.navigationHistory.canGoForward(),
      account,
    };
  }

  publish() {
    if (!this.host.isOpen(this)) return;
    const browser = this.currentState();
    this.state.url = browser.url;
    this.state.title = browser.title;
    this.host.emit({ t: "browser.state", browser });
  }

  log(kind: string, level: string, text: unknown) {
    this.logs.push({ time: Date.now(), kind, level, text: String(text).slice(0, MAX_LOG_TEXT) });
    if (this.logs.length > MAX_LOG_ENTRIES) this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
  }

  // Failed-request events carry only the request id, so the URL is kept from when it started.
  rememberRequest(requestId: string, url: string) {
    this.#requestUrls.set(requestId, url);
    if (this.#requestUrls.size > MAX_TRACKED_REQUESTS)
      this.#requestUrls.delete(this.#requestUrls.keys().next().value!);
  }

  requestUrl(requestId: string) {
    return this.#requestUrls.get(requestId);
  }

  // The renderer dropped this tab's <webview>, for example while remounting its panel.
  // Requests wait until it attaches the next one.
  awaitNewGuest() {
    this.attachment = guestAttachment();
  }

  close() {
    this.activity.dispose();
    this.attachment.reject(new Error("This browser tab is closed"));
  }

  // While an agent drives a tab the user is not looking at, the page should still run at
  // full speed and believe it has focus.
  #emulateFocus(enabled: boolean) {
    if (!this.contents || this.contents.isDestroyed()) return;
    this.contents.setBackgroundThrottling(!enabled);
    return this.cdp("Emulation.setFocusEmulationEnabled", { enabled });
  }
}
