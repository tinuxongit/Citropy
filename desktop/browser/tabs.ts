import {
  ipcMain,
  session,
  webContents,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import type { BrowserAction, BrowserState } from "../../shared/workbench.ts";
import { runAction } from "./actions.ts";
import type { Connections } from "./connections.ts";
import { saveDownloads } from "./downloads.ts";
import { setUpGuest } from "./guest.ts";
import { takeLogs } from "./logs.ts";
import { webAddress } from "./navigation.ts";
import { botProfile, type BrowserProfiles } from "./profiles.ts";
import { keepSessionCookies } from "./session-cookies.ts";
import { takeSnapshot } from "./snapshot.ts";
import { BrowserTab, type TabHost } from "./tab.ts";
import type { BrowserRequest } from "./types.ts";

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
// Pages get no camera, microphone, location or notification access.
const DENY_PERMISSIONS = {
  request: (_: unknown, __: unknown, callback: (granted: boolean) => void) => callback(false),
  check: () => false,
};
// The <webview> preferences Citropy forces, whatever the renderer asked for.
const GUEST_PREFERENCES = {
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  backgroundThrottling: true,
};

export interface BrowserTabsOptions {
  window: BrowserWindow;
  emit: (event: object) => void;
  trusted: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  activeEnvironment: () => string | undefined;
  closing: () => boolean;
  profiles: BrowserProfiles;
  connections: Connections;
}

// The browser tabs agents and the user share. The renderer shows each tab in a <webview>
// and attaches it here, and the Citropy server drives tabs through `request`.
export class BrowserTabs {
  readonly #tabs = new Map<string, BrowserTab>();
  readonly #window: BrowserWindow;
  readonly #closing: () => boolean;
  readonly #profiles: BrowserProfiles;
  readonly #connections: Connections;
  readonly #host: TabHost;

  constructor(options: BrowserTabsOptions) {
    this.#window = options.window;
    this.#closing = options.closing;
    this.#profiles = options.profiles;
    this.#connections = options.connections;
    this.#host = {
      window: options.window,
      emit: options.emit,
      activeEnvironment: options.activeEnvironment,
      accountOf: (profileId) => this.#connections.accountOf(profileId),
      isOpen: (tab) => this.#tabs.get(tab.id) === tab,
      publishGuests: () => this.#publishGuests(),
    };
    this.#followWindowPresence();
    this.#hardenGuests();
    this.#listen(options.trusted);
  }

  // What each open tab shows, for checks such as "close this profile's tabs first".
  states() {
    return [...this.#tabs.values()].map((tab) => tab.state);
  }

  partitions() {
    return [...this.#tabs.values()].map((tab) => tab.partition);
  }

  // Closes every page right away, without waiting for beforeunload handlers.
  closeAll() {
    for (const tab of this.#tabs.values())
      if (tab.contents && !tab.contents.isDestroyed())
        tab.contents.close({ waitForBeforeUnload: false });
  }

  // Tabs signed in to a connection show the account, so they republish when it changes.
  publishAccounts() {
    for (const tab of this.#tabs.values())
      if (this.#connections.accountOf(tab.state.profileId)) tab.publish();
  }

  // Requests from the Citropy server, which sends them over the token-checked desktop socket.
  async request(method: string, body: unknown) {
    if (method === "browser.open") return this.#open(body as BrowserState);
    const request = body as BrowserRequest;
    const tab = this.#tabs.get(request.id);
    if (!tab) throw new Error("This browser tab is closed");
    if (method === "browser.close") return this.#close(tab);
    await tab.attachment.ready;
    if (method === "browser.action") return this.#act(tab, request.input);
    if (method === "browser.logs") return takeLogs(tab, request.clear);
    if (method === "browser.snapshot") return this.#snapshot(tab, request);
    throw new Error("Unknown desktop operation");
  }

  async #open(input: BrowserState) {
    const existing = this.#tabs.get(input.id);
    if (existing) return existing.currentState();
    const url = webAddress(input.url ?? "about:blank");
    const profile =
      this.#connections.profileFor(input.profileId, input.url) ??
      botProfile(input.profileId) ??
      this.#profiles.forTab(input.projectId, input.profileId);
    this.#prepareSession(profile.partition, Boolean(this.#connections.accountOf(profile.id)));
    const tab = new BrowserTab(this.#host, profile.partition, {
      ...input,
      profileId: profile.id,
      profileName: profile.name,
      url,
      width: input.width || DEFAULT_WIDTH,
      height: input.height || DEFAULT_HEIGHT,
      mobile: Boolean(input.mobile),
      error: undefined,
      dialog: undefined,
    });
    this.#tabs.set(tab.id, tab);
    this.#publishGuests();
    await tab.attachment.ready;
    return tab.currentState();
  }

  #prepareSession(partition: string, signedInAccount: boolean) {
    const browserSession = session.fromPartition(partition);
    saveDownloads(browserSession, (contents) => this.#tabOf(contents));
    // Sites signed in through a connection stay signed in after Citropy restarts.
    if (signedInAccount) keepSessionCookies(browserSession);
    browserSession.setPermissionRequestHandler(DENY_PERMISSIONS.request);
    browserSession.setPermissionCheckHandler(DENY_PERMISSIONS.check);
  }

  #close(tab: BrowserTab) {
    this.#tabs.delete(tab.id);
    tab.close();
    this.#publishGuests();
  }

  // A page dialog blocks the page, so answering it cannot wait behind queued actions.
  #act(tab: BrowserTab, input: BrowserAction) {
    if (tab.state.dialog || input.action === "dialog") return runAction(tab, input);
    return tab.activity.run(() => runAction(tab, input));
  }

  #snapshot(tab: BrowserTab, request: BrowserRequest) {
    const { dialog } = tab.state;
    if (dialog)
      throw new Error(
        `A ${dialog.type} dialog is open: ${dialog.message}. Use browser_action with action dialog to respond.`,
      );
    return tab.activity.run(() => takeSnapshot(tab, request));
  }

  #tabOf(contents: WebContents) {
    return [...this.#tabs.values()].find((tab) => tab.contents === contents);
  }

  // The tabs the renderer should show as <webview> elements.
  #guests() {
    return [...this.#tabs.values()].map((tab) => ({
      id: tab.id,
      partition: tab.partition,
      width: tab.state.width,
      height: tab.state.height,
      rendering: tab.activity.rendering,
    }));
  }

  #publishGuests() {
    if (!this.#window.isDestroyed())
      this.#window.webContents.send("browser:guests", this.#guests());
  }

  // A hidden or minimized window hides every tab, which lets their pages slow down.
  #followWindowPresence() {
    for (const event of ["show", "hide", "minimize", "restore"] as const)
      this.#window.on(event as "show", () => {
        for (const tab of this.#tabs.values()) tab.activity.present(tab.onScreen);
      });
  }

  // The renderer may only attach blank, sandboxed webviews in an open tab's partition.
  #hardenGuests() {
    this.#window.webContents.on("will-attach-webview", (event, preferences, params) => {
      delete preferences.preload;
      Object.assign(preferences, GUEST_PREFERENCES);
      const knownPartition = [...this.#tabs.values()].some(
        (tab) => tab.partition === params.partition,
      );
      if (params.src !== "about:blank" || !knownPartition) event.preventDefault();
    });
  }

  #listen(trusted: BrowserTabsOptions["trusted"]) {
    ipcMain.handle("browser:guests", (event) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      return this.#guests();
    });
    ipcMain.on("browser:attach", (event, { id, contentsId }) => {
      if (trusted(event)) this.#attach(id, contentsId);
    });
    ipcMain.on("browser:presented", (event, { id, visible, scale }) => {
      if (trusted(event)) this.#presented(id, visible, scale);
    });
  }

  // The renderer attached a <webview> for a tab. It must be a guest of this window in the
  // tab's own partition, so a page cannot hand over some other web contents.
  #attach(id: unknown, contentsId: unknown) {
    const tab = typeof id === "string" ? this.#tabs.get(id) : undefined;
    const contents = typeof contentsId === "number" ? webContents.fromId(contentsId) : undefined;
    if (
      !tab ||
      !contents ||
      tab.contents === contents ||
      contents.getType() !== "webview" ||
      contents.hostWebContents !== this.#window.webContents ||
      contents.session !== session.fromPartition(tab.partition)
    )
      return;
    const { resolve, reject } = tab.attachment;
    setUpGuest(tab, contents, this.#closing).then(resolve, (error: Error) => {
      reject(error);
      tab.state.error = error.message;
      tab.publish();
    });
  }

  // The renderer reports whether it shows a tab, and at what zoom.
  #presented(id: unknown, visible: unknown, scale: unknown) {
    const tab = typeof id === "string" ? this.#tabs.get(id) : undefined;
    if (!tab) return;
    tab.visible = Boolean(visible) && this.#host.activeEnvironment() === "local";
    if (typeof scale === "number" && Number.isFinite(scale) && scale > 0) tab.scale = scale;
    tab.activity.present(tab.onScreen);
  }
}
