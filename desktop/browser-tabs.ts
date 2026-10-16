import {
  app,
  ipcMain,
  session,
  webContents,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type NativeImage,
  type Session,
  type WebContents,
} from "electron";
import { basename, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { logFailure } from "../shared/expected-errors.mjs";
import type { BrowserAction, BrowserState } from "../shared/workbench.ts";
import { botProfile, browserProfile } from "./browser-profiles.ts";
import { connectionProfile, accountOfProfile } from "./connections.ts";
import { keepSessionCookies } from "./session-cookies.ts";
import { browserActivity } from "./browser-activity.ts";
import { formatTree, type AXNode } from "./browser-snapshot.ts";
import { createPointer } from "./browser-pointer.ts";
import { pressKey } from "./browser-keys.ts";

interface LogEntry {
  time: number;
  kind: string;
  level: string;
  text: string;
}

interface Tab {
  partition: string;
  contents: WebContents | undefined;
  activity: ReturnType<typeof browserActivity>;
  visible: boolean;
  scale: number;
  state: BrowserState;
  logs: LogEntry[];
  requests: Map<string, string>;
  frames: Map<string, { sessionId: string; targetId: string }>;
  frameCount: number;
  pointer: ReturnType<typeof createPointer>;
  media: { colorScheme: string; reducedMotion: string };
  metrics?: string;
  layout?: Promise<unknown>;
  metricsParams?: Record<string, unknown>;
  attached?: Promise<void>;
  attach?: { resolve: () => void; reject: (error: Error) => void };
}

// A page node, a node inside a frame session, or a script object, as CDP commands address them.
interface DomNode {
  backendNodeId?: number;
  objectId?: string;
  session?: string;
  frameId?: string;
}

interface Locator {
  ref?: string | number;
  selector?: string;
  role?: string;
  name?: string;
  x?: number;
  y?: number;
}

type FrameNode = AXNode & { parentId?: string; session?: string; refPrefix?: string };

interface RemoteObject {
  type: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
}

// The Citropy server sends these over the token-checked desktop socket.
interface BrowserRequest {
  id: string;
  input: BrowserAction;
  clear?: boolean;
  selector?: string;
  ref?: string;
  tree?: boolean;
  screenshot?: boolean;
  fullPage?: boolean;
}

const finite = (value: unknown): value is number => Number.isFinite(value);

export const tabs = new Map<string, Tab>();
let window: BrowserWindow;
let emit: (event: object) => void;
let activeEnvironment: () => string | undefined;
let closing: () => boolean;

export function initializeBrowserTabs(options: {
  window: BrowserWindow;
  emit: (event: object) => void;
  trusted: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  activeEnvironment: () => string | undefined;
  closing: () => boolean;
}) {
  ({ window, emit, activeEnvironment, closing } = options);
  const { trusted } = options;
  for (const event of ["show", "hide", "minimize", "restore"] as const)
    window.on(event as "show", () => {
      for (const tab of tabs.values())
        tab.activity.present(tab.visible && window.isVisible() && !window.isMinimized());
    });
  window.webContents.on("will-attach-webview", (event, preferences, params) => {
    delete preferences.preload;
    Object.assign(preferences, {
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    });
    if (
      params.src !== "about:blank" ||
      ![...tabs.values()].some((tab) => tab.partition === params.partition)
    )
      event.preventDefault();
  });
  ipcMain.handle("browser:guests", (event) => {
    if (!trusted(event)) throw new Error("Unavailable outside Citropy");
    return guests();
  });
  ipcMain.on("browser:attach", (event, { id, contentsId }) => {
    if (!trusted(event)) return;
    const tab = tabs.get(id);
    const contents = webContents.fromId(contentsId);
    if (
      !tab ||
      !contents ||
      tab.contents === contents ||
      contents.getType() !== "webview" ||
      contents.hostWebContents !== window.webContents ||
      contents.session !== session.fromPartition(tab.partition)
    )
      return;
    attachGuest(tab, contents);
  });
  ipcMain.on("browser:presented", (event, { id, visible, scale }) => {
    if (!trusted(event)) return;
    const tab = tabs.get(id);
    if (!tab) return;
    tab.visible = Boolean(visible) && activeEnvironment() === "local";
    if (Number.isFinite(scale) && scale > 0) tab.scale = scale;
    tab.activity.present(tab.visible && window.isVisible() && !window.isMinimized());
  });
}

function address(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 16000) throw new Error("Enter a valid web address");
  const value = raw.trim();
  const url = new URL(
    value.includes("://") || value === "about:blank" ? value : `https://${value}`,
  );
  if (!["http:", "https:"].includes(url.protocol) && url.href !== "about:blank")
    throw new Error("Use an http or https address");
  return url.href;
}

function state(tab: Tab): BrowserState {
  const content = tab.contents;
  if (!content || content.isDestroyed())
    return { ...tab.state, loading: true, account: accountOfProfile(tab.state.profileId) };
  return {
    ...tab.state,
    url: content.getURL() || "about:blank",
    title: content.getURL() === "about:blank" ? "Browser" : content.getTitle() || "Browser",
    loading: content.isLoadingMainFrame(),
    canGoBack: content.navigationHistory.canGoBack(),
    canGoForward: content.navigationHistory.canGoForward(),
    account: accountOfProfile(tab.state.profileId),
  };
}

export function publish(tab: Tab) {
  if (tabs.get(tab.state.id) !== tab) return;
  const browser = state(tab);
  Object.assign(tab.state, { url: browser.url, title: browser.title });
  emit({ t: "browser.state", browser });
}

function contentsOf(tab: Tab) {
  if (!tab.contents || tab.contents.isDestroyed())
    throw new Error("This browser tab is reconnecting. Try again.");
  return tab.contents;
}

function cdp(tab: Tab, method: string, params: object = {}, sessionId?: string) {
  const debuggerApi = contentsOf(tab).debugger;
  if (!debuggerApi.isAttached()) debuggerApi.attach("1.3");
  return sessionId
    ? debuggerApi.sendCommand(method, params, sessionId)
    : debuggerApi.sendCommand(method, params);
}

function nodeParams(node: DomNode) {
  const { session: _, frameId: __, ...params } = node;
  return params;
}

async function elementBox(
  tab: Tab,
  node: DomNode,
  { scroll = true, quad = "content" }: { scroll?: boolean; quad?: "content" | "border" } = {},
) {
  if (scroll) await cdp(tab, "DOM.scrollIntoViewIfNeeded", nodeParams(node), node.session);
  const { model } = await cdp(tab, "DOM.getBoxModel", nodeParams(node), node.session);
  const points = model[quad];
  const xs = [points[0], points[2], points[4], points[6]];
  const ys = [points[1], points[3], points[5], points[7]];
  let offsetX = 0;
  let offsetY = 0;
  if (node.frameId) {
    const owner = await cdp(tab, "DOM.getFrameOwner", { frameId: node.frameId });
    const frame = (await cdp(tab, "DOM.getBoxModel", { backendNodeId: owner.backendNodeId })).model
      .content;
    offsetX = frame[0];
    offsetY = frame[1];
  }
  return {
    left: Math.min(...xs) + offsetX,
    top: Math.min(...ys) + offsetY,
    right: Math.max(...xs) + offsetX,
    bottom: Math.max(...ys) + offsetY,
  };
}

const centre = (box: { left: number; top: number; right: number; bottom: number }) => ({
  x: (box.left + box.right) / 2,
  y: (box.top + box.bottom) / 2,
});

function applyViewport(tab: Tab) {
  const { width, height, mobile } = tab.state;
  const metrics = JSON.stringify([width, height, Boolean(mobile)]);
  if (metrics === tab.metrics && tab.layout) return tab.layout;
  tab.metrics = metrics;
  tab.layout = cdp(
    tab,
    "Emulation.setDeviceMetricsOverride",
    (tab.metricsParams = {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 1,
      mobile: Boolean(mobile),
      screenOrientation: {
        type: width > height ? "landscapePrimary" : "portraitPrimary",
        angle: width > height ? 90 : 0,
      },
    }),
  );
  return tab.layout;
}

async function applyMobileMode(tab: Tab) {
  const mobile = Boolean(tab.state.mobile);
  const chrome = process.versions.chrome;
  const major = chrome.split(".")[0]!;
  await cdp(
    tab,
    "Emulation.setUserAgentOverride",
    mobile
      ? {
          userAgent: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`,
          platform: "Linux armv8l",
          userAgentMetadata: {
            brands: [
              { brand: "Chromium", version: major },
              { brand: "Google Chrome", version: major },
            ],
            fullVersionList: [
              { brand: "Chromium", version: chrome },
              { brand: "Google Chrome", version: chrome },
            ],
            platform: "Android",
            platformVersion: "10.0.0",
            architecture: "arm",
            bitness: "64",
            model: "K",
            mobile: true,
            formFactors: ["Mobile"],
          },
        }
      : { userAgent: "" },
  );
  await cdp(tab, "Network.setExtraHTTPHeaders", {
    headers: mobile
      ? {
          "Sec-CH-UA": `"Chromium";v="${major}", "Google Chrome";v="${major}"`,
          "Sec-CH-UA-Mobile": "?1",
          "Sec-CH-UA-Platform": '"Android"',
        }
      : {},
  });
  await cdp(tab, "Emulation.setTouchEmulationEnabled", {
    enabled: mobile,
    maxTouchPoints: mobile ? 5 : 1,
  });
  await cdp(tab, "Emulation.setEmitTouchEventsForMouse", {
    enabled: mobile,
    configuration: mobile ? "mobile" : "desktop",
  });
}

async function prepareTab(tab: Tab) {
  const active = activeEnvironment();
  if (active !== "local" && active)
    throw new Error("Switch to Local to use desktop browser tools.");
  await tab.layout;
}

async function behindCover<T>(tab: Tab, work: () => Promise<T>) {
  if (!tab.visible || !window.isVisible() || window.isMinimized()) return work();
  const id = tab.state.id;
  const still = (await capture(tab))?.toDataURL();
  if (!still) return work();
  await showCover(tab, still);
  try {
    return await work();
  } finally {
    if (tab.metricsParams)
      await cdp(tab, "Emulation.setDeviceMetricsOverride", tab.metricsParams).catch(
        logFailure("Restoring the browser viewport", id),
      );
    await waitForPaint(tab);
    window.webContents.send("browser:cover", id, undefined);
  }
}

async function showCover(tab: Tab, still: string) {
  window.webContents.send("browser:cover", tab.state.id, still);
  await window.webContents
    .executeJavaScript(
      `new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      const image = document.querySelector(${JSON.stringify(`[data-browser-cover="${tab.state.id}"]`)});
      if ((image?.complete && image.naturalWidth) || performance.now() - started > 300) requestAnimationFrame(() => requestAnimationFrame(resolve));
      else requestAnimationFrame(check);
    };
    check();
  })`,
    )
    .catch(logFailure("Waiting for the browser cover", tab.state.id));
}

async function waitForPaint(tab: Tab) {
  await cdp(tab, "Runtime.evaluate", {
    expression:
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    awaitPromise: true,
    timeout: 500,
  }).catch(logFailure("Waiting for the browser to paint", tab.state.id));
}

async function capture(tab: Tab) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      contentsOf(tab).capturePage(),
      new Promise<NativeImage>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Screenshot timed out")), 800);
      }),
    ]);
  } catch (error) {
    logFailure("Capturing the browser cover", tab.state.id)(error);
  } finally {
    clearTimeout(timer);
  }
}

function guests() {
  return [...tabs.values()].map((tab) => ({
    id: tab.state.id,
    partition: tab.partition,
    width: tab.state.width,
    height: tab.state.height,
    rendering: tab.activity.rendering,
  }));
}

function publishGuests() {
  if (!window.isDestroyed()) window.webContents.send("browser:guests", guests());
}

function awaitGuest(tab: Tab) {
  tab.attached = new Promise<void>((resolve, reject) => {
    tab.attach = { resolve, reject };
  });
  tab.attached.catch(() => {});
}

async function open(input: BrowserState) {
  const existing = tabs.get(input.id);
  if (existing) return state(existing);
  const url = address(input.url ?? "about:blank");
  const profile =
    connectionProfile(input.profileId, input.url) ??
    botProfile(input.profileId) ??
    browserProfile(input.projectId, input.profileId);
  input = { ...input, profileId: profile.id, profileName: profile.name };
  const browserSession = session.fromPartition(profile.partition);
  watchDownloads(browserSession);
  if (accountOfProfile(profile.id)) keepSessionCookies(browserSession);
  browserSession.setPermissionRequestHandler((_, __, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  const tab: Tab = {
    partition: profile.partition,
    contents: undefined,
    activity: browserActivity(publishGuests, (enabled) => {
      if (!tab.contents || tab.contents.isDestroyed()) return;
      tab.contents.setBackgroundThrottling(!enabled);
      return cdp(tab, "Emulation.setFocusEmulationEnabled", { enabled });
    }),
    visible: false,
    scale: 1,
    state: {
      ...input,
      url,
      width: input.width || 1920,
      height: input.height || 1080,
      mobile: Boolean(input.mobile),
      error: undefined,
      dialog: undefined,
    },
    logs: [],
    requests: new Map(),
    frames: new Map(),
    frameCount: 0,
    pointer: createPointer(
      (method, params) => cdp(tab, method, params),
      () => tab.visible && window.isVisible() && !window.isMinimized(),
      () => Boolean(tab.state.mobile),
      () => tab.scale,
    ),
    media: { colorScheme: "", reducedMotion: "" },
  };
  awaitGuest(tab);
  tabs.set(input.id, tab);
  publishGuests();
  await tab.attached;
  return state(tab);
}

function attachGuest(tab: Tab, contents: WebContents) {
  const { resolve, reject } = tab.attach!;
  bind(tab, contents).then(resolve, (error: Error) => {
    reject(error);
    tab.state.error = error.message;
    publish(tab);
  });
}

async function bind(tab: Tab, content: WebContents) {
  const id = tab.state.id;
  const url = tab.state.url;
  tab.contents = content;
  tab.metrics = undefined;
  tab.layout = undefined;
  tab.metricsParams = undefined;
  tab.frames.clear();
  content.setZoomFactor(1);
  for (const event of [
    "did-start-loading",
    "did-stop-loading",
    "did-navigate",
    "did-navigate-in-page",
    "page-title-updated",
  ] as const)
    content.on(event as "did-start-loading", () => publish(tab));
  content.on("did-fail-load", (_, code, description, __, mainFrame) => {
    if (!mainFrame || code === -3) return;
    tab.state.error = description;
    publish(tab);
  });
  content.once("destroyed", () => {
    if (tab.contents !== content) return;
    tab.contents = undefined;
    if (!closing() && tabs.get(id) === tab) awaitGuest(tab);
  });
  content.on("render-process-gone", () => {
    tab.state.error = "This page stopped responding. Reload it to continue.";
    publish(tab);
  });
  content.on("will-navigate", (event, url) => {
    try {
      address(url);
    } catch {
      event.preventDefault();
    }
  });
  content.setWindowOpenHandler(({ url, disposition }) => {
    // Sign-in popups (Google, Apple, SSO) open through window.open with window
    // features, which Electron reports as the "new-window" disposition. They
    // need a real child window that keeps window.opener live so the provider
    // can post the result back to the page. Denying them returns null from
    // window.open and the flow dies with "Failed to open popup window". Let
    // those through; the child inherits this tab's session so cookies match.
    if (disposition === "new-window") {
      try {
        address(url);
      } catch {
        return { action: "deny" };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 520, height: 640, autoHideMenuBar: true },
      };
    }
    try {
      const opened = address(url);
      emit({ t: "browser.popup", parentId: id, url: opened });
      tab.logs.push({
        time: Date.now(),
        kind: "tab",
        level: "info",
        text: `Opened ${opened} in a new tab`,
      });
    } catch {}
    return { action: "deny" };
  });
  content.on("before-input-event", (event, inputEvent) => {
    if ((inputEvent.control || inputEvent.meta) && inputEvent.key.toLowerCase() === "l") {
      event.preventDefault();
      window.webContents.focus();
      window.webContents.send("browser:address", id);
    }
  });
  content.debugger.on("message", (_, method, params) => {
    collectLog(tab, method, params);
    if (method === "Target.attachedToTarget" && params.targetInfo.type === "iframe") {
      const key = `f${++tab.frameCount}`;
      tab.frames.set(key, { sessionId: params.sessionId, targetId: params.targetInfo.targetId });
      for (const [domain, options] of [
        ["Runtime.enable", {}],
        ["Log.enable", {}],
        ["Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0, maxPostDataSize: 0 }],
        [
          "Target.setAutoAttach",
          { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
        ],
      ] as const)
        void cdp(tab, domain, options, params.sessionId).catch(
          logFailure(`Browser frame ${domain}`, id),
        );
      return;
    }
    if (method === "Target.detachedFromTarget") {
      for (const [key, value] of tab.frames)
        if (value.sessionId === params.sessionId) tab.frames.delete(key);
      return;
    }
    if (method === "Page.javascriptDialogOpening")
      tab.state.dialog = { type: params.type, message: params.message };
    else if (method === "Page.javascriptDialogClosed") tab.state.dialog = undefined;
    else return;
    publish(tab);
  });
  await Promise.all([
    cdp(tab, "Runtime.enable"),
    cdp(tab, "Log.enable"),
    cdp(tab, "Network.enable", {
      maxTotalBufferSize: 0,
      maxResourceBufferSize: 0,
      maxPostDataSize: 0,
    }),
  ]);
  await cdp(tab, "Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  });
  await cdp(tab, "DOM.enable");
  await cdp(tab, "Overlay.enable");
  tab.activity.reattached();
  await tab.activity.run(async () => {
    await applyViewport(tab);
    await applyMobileMode(tab);
    const navigation = content.loadURL(url).catch((error) => {
      if (error.code !== "ERR_ABORTED" && error.errno !== -3) throw error;
    });
    await Promise.all([navigation, cdp(tab, "Page.enable")]);
  });
  publish(tab);
}

async function target(tab: Tab, input: Locator): Promise<DomNode | null> {
  if (input.ref !== undefined) {
    const [key, id] = String(input.ref).includes(".")
      ? String(input.ref).split(".")
      : [undefined, String(input.ref)];
    const backendNodeId = Number(id);
    const frame = key ? tab.frames.get(key) : undefined;
    if (!Number.isInteger(backendNodeId) || (key && !frame))
      throw new Error("Use a ref from the latest snapshot");
    const node = {
      backendNodeId,
      ...(frame ? { session: frame.sessionId, frameId: frame.targetId } : {}),
    };
    await cdp(tab, "DOM.describeNode", { backendNodeId }, node.session).catch(() => {
      throw new Error(
        "That element is no longer on the page. Take a new snapshot for current refs.",
      );
    });
    return node;
  }
  if (input.selector) {
    const result = await cdp(tab, "Runtime.evaluate", {
      expression: `(() => { const nodes = document.querySelectorAll(${JSON.stringify(input.selector)}); if (nodes.length !== 1) throw new Error('The selector must match exactly one element'); return nodes[0]; })()`,
    });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description ?? "Element not found");
    return { objectId: result.result.objectId };
  }
  if (input.role) {
    const { nodes }: { nodes: AXNode[] } = await cdp(tab, "Accessibility.getFullAXTree");
    const normalize = (value: unknown) =>
      String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");
    const matches = nodes.filter(
      (node) =>
        !node.ignored &&
        node.role?.value === input.role &&
        (input.name === undefined || normalize(node.name?.value) === normalize(input.name)),
    );
    const match = matches.length === 1 ? matches[0] : undefined;
    if (!match?.backendDOMNodeId)
      throw new Error("Choose a role and name that match exactly one element");
    return { backendNodeId: match.backendDOMNodeId };
  }
  return null;
}

async function click(tab: Tab, input: Locator) {
  const node = await target(tab, input);
  let x = input.x;
  let y = input.y;
  const box = node ? await elementBox(tab, node) : undefined;
  if (box) ({ x, y } = centre(box));
  if (!finite(x) || !finite(y)) throw new Error("Choose an element or valid click coordinates");
  await tab.pointer.moveTo(x, y);
  await tab.pointer.press(box);
  if (tab.state.mobile) {
    try {
      await cdp(tab, "Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await cdp(tab, "Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } finally {
      await cdp(tab, "Emulation.setEmitTouchEventsForMouse", {
        enabled: true,
        configuration: "mobile",
      });
    }
  } else {
    await cdp(tab, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
    });
    await cdp(tab, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await cdp(tab, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }
  await tab.pointer.release();
  return node;
}

const watchedSessions = new WeakSet<Session>();

function uniquePath(directory: string, name: string) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 0; ; index++) {
    const candidate = join(directory, index ? `${stem} (${index})${extension}` : name);
    if (!existsSync(candidate)) return candidate;
  }
}

function watchDownloads(browserSession: Session) {
  if (watchedSessions.has(browserSession)) return;
  watchedSessions.add(browserSession);
  browserSession.on("will-download", (_, item, contents) => {
    const tab = [...tabs.values()].find((entry) => entry.contents === contents);
    const directory = join(app.getPath("downloads"), "Citropy");
    mkdirSync(directory, { recursive: true });
    const path = uniquePath(directory, basename(item.getFilename()) || "download");
    item.setSavePath(path);
    item.once("done", (_, outcome) => {
      if (!tab) return;
      tab.logs.push(
        outcome === "completed"
          ? {
              time: Date.now(),
              kind: "download",
              level: "info",
              text: `Downloaded ${item.getURL()} to ${path} (${item.getReceivedBytes()} bytes)`,
            }
          : {
              time: Date.now(),
              kind: "download",
              level: "error",
              text: `Download ${outcome}: ${item.getURL()}`,
            },
      );
    });
  });
}

function remoteText(value: RemoteObject) {
  if (value.type === "string") return value.value;
  if ("value" in value) return JSON.stringify(value.value);
  return value.unserializableValue ?? value.description ?? value.type;
}

// CDP event parameters differ per method, so each branch reads the fields its event defines.
function collectLog(tab: Tab, method: string, params: Record<string, any>) {
  const add = (kind: string, level: string, text: unknown) => {
    tab.logs.push({ time: Date.now(), kind, level, text: String(text).slice(0, 2000) });
    if (tab.logs.length > 300) tab.logs.splice(0, tab.logs.length - 300);
  };
  if (method === "Runtime.consoleAPICalled") {
    const args = params.args.map(remoteText);
    const styles = typeof args[0] === "string" ? (args[0].match(/%c/g) ?? []).length : 0;
    const message = [String(args[0] ?? "").replaceAll("%c", ""), ...args.slice(1 + styles)]
      .join(" ")
      .trim();
    if (!message.startsWith("Electron Security Warning")) add("console", params.type, message);
  } else if (method === "Runtime.exceptionThrown")
    add(
      "exception",
      "error",
      params.exceptionDetails.exception?.description ?? params.exceptionDetails.text,
    );
  else if (
    method === "Log.entryAdded" &&
    params.entry.source !== "network" &&
    ["error", "warning"].includes(params.entry.level)
  )
    add(
      "browser",
      params.entry.level,
      `${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ""}`,
    );
  else if (method === "Network.requestWillBeSent") {
    tab.requests.set(params.requestId, params.request.url);
    if (tab.requests.size > 500) tab.requests.delete(tab.requests.keys().next().value!);
  } else if (method === "Network.responseReceived" && params.response.status >= 400)
    add("network", "error", `${params.response.status} ${params.response.url}`);
  else if (method === "Network.loadingFailed" && !params.canceled)
    add(
      "network",
      "error",
      `${params.errorText} ${tab.requests.get(params.requestId) ?? ""}`.trim(),
    );
}

async function hover(tab: Tab, input: Locator) {
  const node = await target(tab, input);
  let x = input.x;
  let y = input.y;
  if (node) ({ x, y } = centre(await elementBox(tab, node)));
  if (!finite(x) || !finite(y)) throw new Error("Choose an element or valid hover coordinates");
  await tab.pointer.moveTo(x, y);
  await cdp(tab, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await tab.pointer.release();
}

async function waitFor(tab: Tab, input: { selector?: string; text?: string; timeout?: number }) {
  const timeout = input.timeout ?? 5000;
  if (!Number.isFinite(timeout) || timeout < 0 || timeout > 30000)
    throw new Error("Use a wait timeout from 0 to 30000 milliseconds");
  if (input.selector === undefined && input.text === undefined) {
    await new Promise((resolve) => setTimeout(resolve, timeout));
    return `Waited ${timeout} ms`;
  }
  const condition =
    input.selector !== undefined
      ? `(() => { const node = document.querySelector(${JSON.stringify(String(input.selector))}); if (!node) return false; const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden"; })()`
      : `Boolean(document.body && document.body.innerText.includes(${JSON.stringify(String(input.text))}))`;
  const started = Date.now();
  for (;;) {
    const { result, exceptionDetails } = await cdp(tab, "Runtime.evaluate", {
      expression: condition,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? "Invalid selector");
    if (result.value === true) return `Found after ${Date.now() - started} ms`;
    if (Date.now() - started >= timeout)
      throw new Error(
        `Timed out after ${timeout} ms waiting for ${input.selector !== undefined ? `selector ${input.selector}` : `text "${input.text}"`}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const mediaValues = { colorScheme: ["light", "dark"], reducedMotion: ["reduce", "no-preference"] };

async function emulate(tab: Tab, input: { colorScheme?: string; reducedMotion?: string }) {
  for (const key of ["colorScheme", "reducedMotion"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value !== "none" && !mediaValues[key].includes(value))
      throw new Error(`${key} must be ${mediaValues[key].join(", ")} or none`);
    tab.media[key] = value === "none" ? "" : value;
  }
  await cdp(tab, "Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: tab.media.colorScheme },
      { name: "prefers-reduced-motion", value: tab.media.reducedMotion },
    ],
  });
  return `Emulating color scheme ${tab.media.colorScheme || "system"} and reduced motion ${tab.media.reducedMotion || "system"}`;
}

async function withFrames(tab: Tab, nodes: FrameNode[]) {
  const all = [...nodes];
  const queue = [...nodes];
  while (queue.length) {
    const node = queue.shift()!;
    if (node.role?.value !== "Iframe" || !node.backendDOMNodeId) continue;
    const frameId = (
      await cdp(
        tab,
        "DOM.describeNode",
        { backendNodeId: node.backendDOMNodeId },
        node.session,
      ).catch(logFailure("Reading a browser frame"))
    )?.node?.frameId;
    if (!frameId) continue;
    let inner: FrameNode[] | undefined = (
      await cdp(tab, "Accessibility.getFullAXTree", { frameId }, node.session).catch(
        logFailure("Reading a browser frame", frameId),
      )
    )?.nodes;
    let frame: { key: string; sessionId: string } | undefined;
    if (!inner?.length || inner.length === 1) {
      const entry = [...tab.frames].find(([, value]) => value.targetId === frameId);
      if (entry) {
        frame = { key: entry[0], sessionId: entry[1].sessionId };
        inner = (
          await cdp(tab, "Accessibility.getFullAXTree", {}, frame.sessionId).catch(
            logFailure("Reading a browser frame", frameId),
          )
        )?.nodes;
      }
    }
    if (!inner?.length) continue;
    const session = frame?.sessionId ?? node.session;
    const refPrefix = frame ? `${frame.key}.` : (node.refPrefix ?? "");
    const renamed = inner.map((entry) => ({
      ...entry,
      nodeId: `${frameId}:${entry.nodeId}`,
      ...(entry.parentId ? { parentId: `${frameId}:${entry.parentId}` } : {}),
      childIds: (entry.childIds ?? []).map((id) => `${frameId}:${id}`),
      ...(entry.backendDOMNodeId && refPrefix
        ? { ref: `${refPrefix}${entry.backendDOMNodeId}` }
        : {}),
      ...(session ? { session, refPrefix } : {}),
    }));
    const root = renamed.find((entry) => !entry.parentId) ?? renamed[0]!;
    node.childIds = [...(node.childIds ?? []), root.nodeId];
    all.push(...renamed);
    queue.push(...renamed);
  }
  return all;
}

async function swipe(
  tab: Tab,
  input: { x: number; y: number; toX: number; toY: number; duration?: number },
): Promise<string | undefined> {
  const { x, y, toX, toY } = input;
  if (![x, y, toX, toY].every(Number.isFinite))
    throw new Error("A swipe needs x, y, toX and toY coordinates");
  const duration = input.duration ?? 300;
  if (!Number.isFinite(duration) || duration < 0 || duration > 5000)
    throw new Error("Use a swipe duration from 0 to 5000 milliseconds");
  const steps = Math.max(2, Math.round(duration / 16));
  const point = (step: number) => ({
    x: x + ((toX - x) * step) / steps,
    y: y + ((toY - y) * step) / steps,
  });
  const pause = async (step?: number) => {
    if (step !== undefined) await tab.pointer.drawAt(point(step).x, point(step).y, true);
    await new Promise((resolve) => setTimeout(resolve, duration / steps));
  };
  await tab.pointer.moveTo(input.x, input.y);
  if (tab.state.mobile) {
    await cdp(tab, "Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(0)] });
    for (let step = 1; step <= steps; step++) {
      await pause(step);
      await cdp(tab, "Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(step)] });
    }
    await cdp(tab, "Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await tab.pointer.release();
    return;
  }
  const content = contentsOf(tab);
  let dragData: { items?: Array<{ mimeType: string }> } | undefined;
  const intercept = (_: unknown, method: string, params: { data?: typeof dragData }) => {
    if (method === "Input.dragIntercepted") dragData = params.data;
  };
  content.debugger.on("message", intercept);
  await cdp(tab, "Input.setInterceptDrags", { enabled: true });
  try {
    await cdp(tab, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point(0),
      button: "none",
      buttons: 0,
    });
    await pause();
    await cdp(tab, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point(0),
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= steps; step++) {
      await pause(step);
      await cdp(tab, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...point(step),
        button: "left",
        buttons: 1,
      });
    }
    if (dragData)
      for (const type of ["dragEnter", "dragOver", "drop"])
        await cdp(tab, "Input.dispatchDragEvent", {
          type,
          x: input.toX,
          y: input.toY,
          data: dragData,
        });
    await cdp(tab, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point(steps),
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    content.debugger.off("message", intercept);
    await cdp(tab, "Input.setInterceptDrags", { enabled: false });
    await tab.pointer.release();
  }
  return dragData
    ? `Dragged ${dragData.items?.map((item) => item.mimeType).join(", ") || "content"} and dropped it at the end point`
    : undefined;
}

async function evaluate(tab: Tab, expression: unknown) {
  if (typeof expression !== "string" || !expression.trim() || expression.length > 20000)
    throw new Error("Provide a JavaScript expression to evaluate");
  const { result, exceptionDetails } = await cdp(tab, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: 10000,
    userGesture: false,
  });
  if (exceptionDetails)
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text ?? "The expression failed",
    );
  const value = JSON.stringify(result.value ?? null);
  return value.length > 20000 ? `${value.slice(0, 20000)}… (truncated)` : value;
}

async function closeTopLayer(tab: Tab) {
  const { result } = await cdp(tab, "Runtime.evaluate", {
    expression: "Boolean(document.querySelector('dialog:modal, :popover-open'))",
    returnByValue: true,
  });
  if (!result.value) return false;
  pressKey(contentsOf(tab), "Escape");
  return true;
}

async function performAction(tab: Tab, input: BrowserAction) {
  const content = contentsOf(tab);
  tab.state.error = undefined;
  if (tab.state.dialog && input.action !== "dialog")
    throw new Error(`Respond to the browser dialog first: ${tab.state.dialog.message}`);
  if (["click", "type", "press", "scroll", "swipe", "hover"].includes(input.action))
    await prepareTab(tab);
  let result: string | undefined;
  const since = Date.now();
  let navigationStarted = false;
  const startedLoading = () => {
    navigationStarted = true;
  };
  content.on("did-start-loading", startedLoading);
  try {
    switch (input.action) {
      case "navigate":
        await content.loadURL(address(input.url)).catch((error) => {
          if (error.code !== "ERR_ABORTED" && error.errno !== -3) throw error;
        });
        break;
      case "back":
        if (tab.state.mobile && (await closeTopLayer(tab))) break;
        if (content.navigationHistory.canGoBack()) {
          content.navigationHistory.goBack();
          await settle(tab, () => true);
        }
        break;
      case "forward":
        if (content.navigationHistory.canGoForward()) {
          content.navigationHistory.goForward();
          await settle(tab, () => true);
        }
        break;
      case "reload":
        content.reload();
        await settle(tab, () => true);
        break;
      case "stop":
        content.stop();
        break;
      case "click":
        await click(tab, input);
        break;
      case "swipe":
        result = await swipe(tab, input);
        break;
      case "hover":
        await hover(tab, input);
        break;
      case "wait":
        result = await waitFor(tab, input);
        break;
      case "emulate":
        result = await emulate(tab, input);
        break;
      case "evaluate":
        result = await evaluate(tab, input.expression);
        break;
      case "type": {
        if (typeof input.text !== "string" || input.text.length > 100000)
          throw new Error("Invalid browser text");
        if (input.ref !== undefined || input.selector || input.role) {
          const node = (await click(tab, input))!;
          const object = node.objectId
            ? node
            : (await cdp(tab, "DOM.resolveNode", nodeParams(node), node.session)).object;
          await cdp(
            tab,
            "Runtime.callFunctionOn",
            {
              objectId: object.objectId,
              functionDeclaration:
                "function(){ if (typeof this.select === 'function') this.select(); else if (this.isContentEditable) { const range = document.createRange(); range.selectNodeContents(this); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); } }",
            },
            node.session,
          );
        }
        if (tab.pointer.watched() && input.text.length <= 200)
          for (const character of input.text) {
            await content.insertText(character);
            await new Promise((resolve) => setTimeout(resolve, 18));
          }
        else await content.insertText(input.text);
        break;
      }
      case "press":
        if (typeof input.key !== "string" || input.key.length > 100) throw new Error("Invalid key");
        pressKey(content, input.key);
        break;
      case "scroll": {
        if (!Number.isFinite(input.x) || !Number.isFinite(input.y))
          throw new Error("Invalid scroll distance");
        let point = { x: tab.state.width / 2, y: tab.state.height / 2 };
        const node = await target(tab, input);
        if (node) {
          const middle = centre(await elementBox(tab, node, { scroll: false }));
          point = {
            x: Math.min(Math.max(middle.x, 1), tab.state.width - 1),
            y: Math.min(Math.max(middle.y, 1), tab.state.height - 1),
          };
        }
        await tab.pointer.moveTo(point.x, point.y);
        await cdp(tab, "Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: point.x,
          y: point.y,
          deltaX: input.x,
          deltaY: input.y,
        });
        await tab.pointer.release();
        break;
      }
      case "select": {
        if (typeof input.option !== "string" || !input.option)
          throw new Error("Provide the option value or visible text to select");
        const node = await target(tab, input);
        if (!node) throw new Error("Choose the dropdown by ref or selector");
        const box = await elementBox(tab, node);
        await tab.pointer.moveTo(centre(box).x, centre(box).y);
        await tab.pointer.press(box);
        await tab.pointer.release();
        const object = node.objectId
          ? node
          : (await cdp(tab, "DOM.resolveNode", nodeParams(node), node.session)).object;
        const { result: picked, exceptionDetails } = await cdp(
          tab,
          "Runtime.callFunctionOn",
          {
            objectId: object.objectId,
            arguments: [{ value: input.option }],
            returnByValue: true,
            functionDeclaration:
              "function(choice) { if (!(this instanceof HTMLSelectElement)) throw new Error('That element is not a dropdown'); const option = [...this.options].find((entry) => entry.value === choice) ?? [...this.options].find((entry) => entry.text.trim() === choice.trim()); if (!option) throw new Error('No option matches ' + choice + '. Options: ' + [...this.options].map((entry) => entry.text.trim()).join(', ')); this.value = option.value; this.dispatchEvent(new Event('input', { bubbles: true })); this.dispatchEvent(new Event('change', { bubbles: true })); return option.text.trim(); }",
          },
          node.session,
        );
        if (exceptionDetails)
          throw new Error(
            exceptionDetails.exception?.description?.split("\n")[0].replace(/^Error: /, "") ??
              "Could not select that option",
          );
        result = `Selected ${picked.value}`;
        break;
      }
      case "upload": {
        if (
          !Array.isArray(input.paths) ||
          !input.paths.length ||
          input.paths.some((path) => typeof path !== "string")
        )
          throw new Error("Provide the files to upload");
        const node = await target(tab, input);
        if (!node) throw new Error("Choose the file input by ref or selector");
        const box = await elementBox(tab, node);
        await tab.pointer.moveTo(centre(box).x, centre(box).y);
        await tab.pointer.press(box);
        await tab.pointer.release();
        await cdp(
          tab,
          "DOM.setFileInputFiles",
          { files: input.paths, ...nodeParams(node) },
          node.session,
        );
        result = `Selected ${input.paths.length} file${input.paths.length === 1 ? "" : "s"}`;
        break;
      }
      case "resize": {
        if (
          !Number.isInteger(input.width) ||
          !Number.isInteger(input.height) ||
          input.width < 320 ||
          input.width > 3840 ||
          input.height < 240 ||
          input.height > 2160
        )
          throw new Error("Use a width from 320 to 3840 and a height from 240 to 2160 pixels.");
        if (input.mobile !== undefined && typeof input.mobile !== "boolean")
          throw new Error("Mobile mode must be true or false.");
        const mobile = input.mobile ?? Boolean(tab.state.mobile);
        const changedMode = mobile !== Boolean(tab.state.mobile);
        Object.assign(tab.state, {
          width: input.width,
          height: input.height,
          mobile,
        });
        publishGuests();
        await applyViewport(tab);
        if (changedMode) {
          await applyMobileMode(tab);
          const url = content.getURL();
          if (url && url !== "about:blank")
            await content
              .loadURL(url, { extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n" })
              .catch((error) => {
                if (error.code !== "ERR_ABORTED" && error.errno !== -3) throw error;
              });
        }
        break;
      }
      case "dialog":
        await cdp(tab, "Page.handleJavaScriptDialog", {
          accept: Boolean(input.accept),
          promptText: input.text ?? "",
        });
        break;
      case "snapshot":
        break;
      default:
        throw new Error("Unknown browser action");
    }
    if (["click", "type", "press", "swipe", "upload", "scroll", "select"].includes(input.action))
      await settle(tab, () => navigationStarted);
  } finally {
    content.off("did-start-loading", startedLoading);
  }
  await tab.pointer.release();
  publish(tab);
  const events = tab.logs.filter((entry) => entry.time >= since);
  return {
    ...state(tab),
    ...(result === undefined ? {} : { result }),
    ...(events.length ? { events } : {}),
  };
}

async function settle(tab: Tab, navigationStarted: () => boolean) {
  const content = contentsOf(tab);
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (!navigationStarted() && !content.isLoadingMainFrame()) return;
  if (!content.isLoadingMainFrame()) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 10000);
    function done() {
      clearTimeout(timer);
      content.off("did-stop-loading", done);
      resolve();
    }
    content.once("did-stop-loading", done);
  });
}

async function action(tab: Tab, input: BrowserAction) {
  if (input.action === "dialog") return performAction(tab, input);
  const content = contentsOf(tab);
  let onDialog!: (event: unknown, method: string) => void;
  const opened = new Promise<BrowserState>((resolve) => {
    onDialog = (_, method) => {
      if (method === "Page.javascriptDialogOpening") resolve(state(tab));
    };
    content.debugger.on("message", onDialog);
  });
  try {
    return await Promise.race([performAction(tab, input), opened]);
  } finally {
    content.debugger.off("message", onDialog);
  }
}

export async function handleBrowser(method: string, body: unknown) {
  if (method === "browser.open") return open(body as BrowserState);
  const params = body as BrowserRequest;
  const tab = tabs.get(params.id);
  if (!tab) throw new Error("This browser tab is closed");
  if (method === "browser.close") {
    tabs.delete(params.id);
    tab.activity.dispose();
    tab.attach?.reject(new Error("This browser tab is closed"));
    publishGuests();
    return;
  }
  await tab.attached;
  if (tab.state.dialog) {
    if (method === "browser.action") return action(tab, params.input);
    if (method === "browser.snapshot")
      throw new Error(
        `A ${tab.state.dialog.type} dialog is open: ${tab.state.dialog.message}. Use browser_action with action dialog to respond.`,
      );
  }
  if (method === "browser.action" && params.input.action === "dialog")
    return action(tab, params.input);
  if (method === "browser.action") return tab.activity.run(() => action(tab, params.input));
  if (method === "browser.logs") {
    const entries = tab.logs.slice();
    if (params.clear !== false) tab.logs.length = 0;
    return entries;
  }
  if (method === "browser.snapshot")
    return tab.activity.run(async () => {
      await prepareTab(tab);
      let scope: DomNode | null | undefined;
      if (params.selector !== undefined) {
        scope = await target(tab, { selector: params.selector });
        const { node } = await cdp(tab, "DOM.describeNode", scope!);
        scope = { ...scope, backendNodeId: node.backendNodeId };
      } else if (params.ref !== undefined) scope = await target(tab, { ref: params.ref });
      const session = scope?.session;
      const scopeRef = scope
        ? session
          ? `${[...tab.frames].find(([, value]) => value.sessionId === session)?.[0]}.${scope.backendNodeId}`
          : scope.backendNodeId
        : undefined;
      const nodes =
        params.tree === false
          ? []
          : await withFrames(tab, (await cdp(tab, "Accessibility.getFullAXTree")).nodes);
      const lines = formatTree(nodes, scopeRef);
      let image;
      if (params.screenshot === true) {
        const { cssVisualViewport } = await cdp(tab, "Page.getLayoutMetrics");
        let clip = {
          x: cssVisualViewport.pageX,
          y: cssVisualViewport.pageY,
          width: tab.state.width / cssVisualViewport.scale,
          height: tab.state.height / cssVisualViewport.scale,
        };
        if (scope) {
          const box = await elementBox(tab, scope, { quad: "border" });
          const metrics = await cdp(tab, "Page.getLayoutMetrics");
          clip = {
            x: box.left + metrics.cssVisualViewport.pageX,
            y: box.top + metrics.cssVisualViewport.pageY,
            width: Math.max(1, box.right - box.left),
            height: Math.max(1, box.bottom - box.top),
          };
        } else if (params.fullPage === true) {
          const { cssContentSize } = await cdp(tab, "Page.getLayoutMetrics");
          clip = {
            x: 0,
            y: 0,
            width: cssContentSize.width,
            height: Math.min(cssContentSize.height, 16000),
          };
        }
        image = await behindCover(tab, async () => {
          await tab.pointer.hide();
          try {
            return await cdp(tab, "Page.captureScreenshot", {
              format: "jpeg",
              quality: 80,
              fromSurface: true,
              captureBeyondViewport: Boolean(scope) || params.fullPage === true,
              clip: { ...clip, scale: cssVisualViewport.scale },
            }).then((result) => result.data as string, logFailure("Taking a browser screenshot"));
          } finally {
            await tab.pointer.release();
          }
        });
      }
      const body = lines.join("\n");
      const limit = 28000;
      const tree =
        body.length > limit
          ? `${body.slice(0, limit)}\n… truncated. Snapshot a selector or ref to see the rest.`
          : body;
      const errors = tab.logs.filter((entry) => entry.level === "error").length;
      return {
        text: `${contentsOf(tab).getTitle()}\n${contentsOf(tab).getURL()}\nViewport: ${tab.state.width} × ${tab.state.height}${tab.state.mobile ? " (mobile)" : " (desktop)"}. Screenshot coordinates use these dimensions. Use [ref=N] values with browser_action ref.${errors ? ` ${errors} unread error${errors === 1 ? "" : "s"} in browser_logs.` : ""}\n\n${tree}`,
        image,
      };
    });
  throw new Error("Unknown desktop operation");
}
