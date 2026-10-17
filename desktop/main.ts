import { SshEnvironments, sshHosts, type ConnectionInput as SshInput } from "./ssh.ts";
import { chooseNativeFolder, listRemoteFolder } from "./folder-picker.ts";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { release } from "node:os";
import v8 from "node:v8";
import { createAppUpdater } from "./updates.ts";
import { stageScriptUpdate } from "./script-update.ts";
import { fetchReleaseHistory, fetchReleaseNotes } from "./release-notes.ts";
import { spawnAppImageRelaunch } from "./appimage-relaunch.ts";
import { refreshMenuIcon } from "./menu-icon.ts";
import { createSecondInstanceFocus, prepareInitialWindowReveal } from "./window-reveal.ts";
import { packagedBackend } from "./backend.ts";
import { desktopDiagnostics } from "./diagnostics.ts";
import { BrowserProfiles, type ProfileInput } from "./browser/profiles.ts";
import { Connections, type ConnectionInput } from "./browser/connections.ts";
import { createSignInView } from "./browser/sign-in-view.ts";
import { BrowserTabs } from "./browser/tabs.ts";
import {
  app,
  dialog,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  screen,
  shell,
  session,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { WebSocket } from "ws";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve, sep } from "node:path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  accessSync,
  constants,
  existsSync,
  statSync,
} from "node:fs";
import { migrateDesktopData } from "./migrate-data.ts";
import { logFailure } from "../shared/expected-errors.mjs";
import { defaultPort } from "../shared/ports.mjs";

// The Citropy server sends these over the token-checked desktop socket.
interface Notice {
  id: string;
  title: string;
  text: string;
  silent?: boolean;
  target?: unknown;
}

type FolderRequest = { id?: unknown; path?: unknown } | undefined;

const development = !app.isPackaged && process.env.CITROPY_DEVELOPMENT === "1";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const appName = development ? "Citropy Dev" : "Citropy";
const desktopId = development ? "citropy-dev" : "citropy";
const appIcon = fileURLToPath(new URL(`./assets/${desktopId}.png`, import.meta.url));
app.setName(appName);
app.setPath(
  "userData",
  migrateDesktopData(
    app.getPath("appData"),
    process.env.CITROPY_DESKTOP_DATA ||
      (development ? join(app.getPath("appData"), appName) : undefined),
  ),
);
if (!app.requestSingleInstanceLock()) app.exit(0);
const diagnose = desktopDiagnostics(app.getPath("userData"));
diagnose("app.started", {
  version,
  electron: process.versions.electron,
  platform: process.platform,
  packaged: app.isPackaged,
});
process.on("uncaughtExceptionMonitor", (_, origin) =>
  diagnose("app.uncaught-exception", { reason: origin }),
);
app.on("child-process-gone", (_, details) => {
  diagnose("child.exited", { type: details.type, reason: details.reason, code: details.exitCode });
});
app.on("quit", (_, code) => diagnose("app.exited", { code }));
let forcedExit = false;
process.on("SIGTERM", () => {
  forcedExit = true;
  diagnose("app.quit-requested", { reason: "SIGTERM" });
  app.quit();
  const timer = setTimeout(() => {
    diagnose("app.forced-exit", { reason: "shutdown-timeout", code: 1 });
    app.exit(1);
  }, 15000);
  timer.unref();
});
let focusDesktopWindow: (() => void) | undefined;
const secondInstance = createSecondInstanceFocus(() => focusDesktopWindow);
app.on("second-instance", () => secondInstance.focus());
if (process.platform === "linux") {
  app.setDesktopName(`${desktopId}.desktop`);
  try {
    if (refreshMenuIcon({ base: desktopId, picturePath: appIcon }))
      diagnose("menu-icon.refreshed", {});
  } catch (error) {
    diagnose("menu-icon.failed", { reason: (error as Error).message });
  }
}
if (app.isPackaged) {
  process.env.CITROPY_DEVELOPMENT = "0";
  process.env.CITROPY_PORT ||= String(defaultPort());
  process.env.CITROPY_HOST = "127.0.0.1";
  process.env.CITROPY_URL = `http://127.0.0.1:${process.env.CITROPY_PORT}`;
  process.env.CITROPY_UI_URL = process.env.CITROPY_URL;
  process.env.CITROPY_DESKTOP_TOKEN = randomBytes(32).toString("hex");
}
// Only the backend worker, which shares this process's V8 flags, trades speed for memory. Renderers keep default flags because the size mode made interface work about 13% slower.
v8.setFlagsFromString("--optimize-for-size");
app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess2");
app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess");
// Chromium redraws only changed regions over the stage background, rounding them one shade off and leaving visible rectangles behind running turns.
app.commandLine.appendSwitch("ui-disable-partial-swap");
const backend = app.isPackaged ? packagedBackend({ ...process.env }, diagnose) : undefined;
let updates: ReturnType<typeof createAppUpdater> | undefined;
let environments: SshEnvironments | undefined;
let folderChoice: AbortController | undefined;
// Set once the window exists and the browser profiles and connections are loaded.
let browser: { profiles: BrowserProfiles; connections: Connections; tabs: BrowserTabs } | undefined;
let applyingUpdate = false;
let connectDesktop: () => void;
const base = new URL(process.env.CITROPY_URL ?? `http://127.0.0.1:${defaultPort()}`);
const ui = new URL(process.env.CITROPY_UI_URL ?? base.href);
if (
  ![base, ui].every(
    (url) => ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.protocol === "http:",
  )
)
  throw new Error("Citropy desktop requires a local server");
const token = process.env.CITROPY_DESKTOP_TOKEN;
if (!token) throw new Error("Start Citropy desktop through npm run desktop");
delete process.env.CITROPY_DESKTOP_TOKEN;
const windowFile = join(app.getPath("userData"), "window.json");
let window: BrowserWindow;
// The theme's frame color, which the window shows before the page draws.
let windowBackground = "#0a0a09";
const hexColor = /^#[0-9a-f]{6}$/i;
let socket: WebSocket | undefined;
let quitting = false;
const notifications = new Set<Notification>();
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  diagnose("app.quitting");
  folderChoice?.abort();
  void (environments?.dispose() ?? Promise.resolve())
    .then(() => backend?.stop())
    .catch((error: Error) => diagnose("app.quit-cleanup-failed", { reason: error.message }))
    .finally(() => {
      updates?.dispose();
      for (const notification of notifications) notification.close();
      browser?.tabs.closeAll();
      socket?.close();
      app.quit();
    });
});

const emit = (event: object) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
};

const updateRepository = "tinuxongit/Citropy";

function macScriptUpdates() {
  if (process.platform !== "darwin" || !app.isPackaged) return false;
  const result = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=2", process.execPath], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return !/Authority=Developer ID Application/.test(`${result.stdout}${result.stderr}`);
}

async function request(method: string, body: unknown) {
  if (method === "notification") {
    if (!Notification.isSupported() || window.isFocused()) return;
    const params = body as Notice;
    const notification = new Notification({
      title: params.title,
      body: params.text.slice(0, 500),
      silent: Boolean(params.silent),
    });
    notifications.add(notification);
    notification.on("click", () => {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send("notification:open", {
        id: params.id,
        target: params.target,
        environmentId: "local",
      });
    });
    notification.on("close", () => notifications.delete(notification));
    notification.on("failed", () => notifications.delete(notification));
    notification.show();
    return;
  }
  if (method === "focus") {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  if (!browser) throw new Error("Citropy is still starting");
  const { profiles, connections, tabs } = browser;
  if (method.startsWith("profiles."))
    return profiles.handle(method.slice(9), body as ProfileInput, tabs.states());
  if (method.startsWith("connections.")) {
    const result = await connections.handle(
      method.slice(12),
      body as ConnectionInput,
      tabs.states(),
    );
    tabs.publishAccounts();
    return result;
  }
  if (method === "diagnostics")
    return app.getAppMetrics().map((entry) => ({
      pid: entry.pid,
      parent: process.pid,
      name: entry.name || `Citropy ${entry.type}`,
      cpu: entry.cpu.percentCPUUsage,
      cpuInterval: true,
      ...(Number.isFinite(entry.cpu.cumulativeCPUUsage)
        ? { cpuTime: entry.cpu.cumulativeCPUUsage }
        : {}),
      ...(Number.isFinite(entry.creationTime) && entry.creationTime > 0
        ? { startedAt: `electron:${entry.creationTime}` }
        : {}),
      memory: entry.memory.workingSetSize * 1024,
    }));
  return tabs.request(method, body);
}

app
  .whenReady()
  .then(async () => {
    const saved = existsSync(windowFile) ? JSON.parse(readFileSync(windowFile, "utf8")) : {};
    if (hexColor.test(saved.background)) windowBackground = saved.background;
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const minWidth = Math.min(960, workArea.width);
    const minHeight = Math.min(640, workArea.height);
    const width = Math.min(
      workArea.width,
      Math.max(
        minWidth,
        Number.isFinite(saved.width)
          ? Math.round(saved.width)
          : Math.min(1440, workArea.width - 64),
      ),
    );
    const height = Math.min(
      workArea.height,
      Math.max(
        minHeight,
        Number.isFinite(saved.height)
          ? Math.round(saved.height)
          : Math.min(900, workArea.height - 64),
      ),
    );
    window = new BrowserWindow({
      width,
      height,
      x: workArea.x + Math.round((workArea.width - width) / 2),
      y: workArea.y + Math.round((workArea.height - height) / 2),
      minWidth,
      minHeight,
      title: appName,
      icon: appIcon,
      frame: false,
      ...(process.platform === "darwin"
        ? { titleBarStyle: "hidden", trafficLightPosition: { x: 15, y: 14 } }
        : {}),
      show: false,
      backgroundColor: windowBackground,
      autoHideMenuBar: true,
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
        webviewTag: true,
      },
    });
    window.on("close", () => {
      const bounds = window.getNormalBounds();
      try {
        mkdirSync(app.getPath("userData"), { recursive: true });
        writeFileSync(
          windowFile,
          JSON.stringify({
            width: bounds.width,
            height: bounds.height,
            maximized: window.isMaximized(),
            background: windowBackground,
          }),
          { mode: 0o600 },
        );
      } catch (error) {
        diagnose("window.save-failed", { reason: (error as Error).message });
      }
    });
    window.on("closed", () => {
      diagnose("app.quit-requested", { reason: "window-closed" });
      app.quit();
    });
    window.webContents.on("render-process-gone", (_, details) => {
      diagnose("renderer.exited", { reason: details.reason, code: details.exitCode });
    });
    focusDesktopWindow = prepareInitialWindowReveal(window, {
      maximized: saved.maximized,
    });
    secondInstance.flush();
    const started = backend?.start() ?? Promise.resolve();
    void started.catch(() => {});
    const profiles = await BrowserProfiles.load(app.getPath("userData"), session);
    const connections = await Connections.load(app.getPath("userData"), session);
    Menu.setApplicationMenu(null);
    const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === ui.origin;
    const sshEnvironments = new SshEnvironments({
      directory: app.getPath("userData"),
      appRoot: fileURLToPath(new URL("..", import.meta.url)),
      origin: ui.origin,
      projectDefaults: async (settings, signal) => {
        const response = await fetch(new URL("/api/projects/defaults", base), {
          method: settings === undefined ? "GET" : "PATCH",
          headers: { "content-type": "application/json" },
          ...(settings === undefined ? {} : { body: JSON.stringify({ settings }) }),
          signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save global project defaults.");
        return data;
      },
      changed: (state) => {
        if (!window.isDestroyed()) window.webContents.send("environments:state", state);
      },
    });
    environments = sshEnvironments;
    await started;
    await sshEnvironments.load();
    // Inputs come from the renderer. Ids must be strings, and the environment methods reject unknown ones.
    const idOf = (value: unknown) => {
      if (typeof value !== "string") throw new Error("This SSH connection was removed.");
      return value;
    };
    for (const [channel, action] of Object.entries<(input: unknown) => unknown>({
      state: () => sshEnvironments.state(),
      hosts: () => sshHosts(),
      save: (input) => sshEnvironments.save(input as SshInput | undefined),
      "project-defaults": (settings) => sshEnvironments.syncProjectDefaults(settings),
      connect: async (id) => {
        return sshEnvironments.connect(idOf(id));
      },
      disconnect: (id) => sshEnvironments.disconnect(idOf(id)),
      remove: (id) => sshEnvironments.remove(idOf(id)),
      stop: (id) => sshEnvironments.stop(idOf(id)),
      "choose-folder": async (request) => {
        const input = request as FolderRequest;
        if (folderChoice) throw new Error("Finish choosing the current folder first.");
        const connection =
          input?.id === "local"
            ? undefined
            : sshEnvironments.connections.find((entry) => entry.id === input?.id);
        if (input?.id !== "local" && !connection)
          throw new Error("This SSH connection was removed.");
        if (connection?.kind === "container") return "/workspace";
        const controller = new AbortController();
        folderChoice = controller;
        try {
          return await chooseNativeFolder(
            {
              connection,
              path: typeof input?.path === "string" ? input.path : undefined,
              signal: controller.signal,
            },
            (options) => dialog.showOpenDialog(window, options),
          );
        } finally {
          if (folderChoice === controller) folderChoice = undefined;
        }
      },
      "list-folder": async (request) => {
        const input = request as FolderRequest;
        const connection = sshEnvironments.connections.find((entry) => entry.id === input?.id);
        if (!connection || connection.kind === "container")
          throw new Error("This SSH connection was removed.");
        return listRemoteFolder(
          connection,
          typeof input?.path === "string" ? input.path : "",
          AbortSignal.timeout(25000),
        );
      },
    }))
      ipcMain.handle(`environments:${channel}`, (event, input) => {
        if (!trusted(event)) throw new Error("Unavailable outside Citropy");
        return action(input);
      });
    const unavailableUpdate = !app.isPackaged
      ? "Development build. Live source changes are enabled; release updates require an installed Citropy build."
      : process.platform === "linux" &&
          !(
            process.env.APPIMAGE &&
            process.env.APPDIR &&
            resolve(process.execPath).startsWith(`${resolve(process.env.APPDIR)}${sep}`)
          )
        ? "Install the Citropy AppImage to download and apply release updates."
        : undefined;
    const scriptedUpdates = !unavailableUpdate && macScriptUpdates();
    const autoUpdater =
      unavailableUpdate || scriptedUpdates
        ? undefined
        : (await import("electron-updater").then((module) => module.default || module)).autoUpdater;
    let stagedUpdate: Awaited<ReturnType<typeof stageScriptUpdate>> | undefined;
    const scriptInstaller = {
      check: async () => {
        const response = await fetch(`https://github.com/${updateRepository}/releases/latest`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error(`GitHub answered ${response.status} for the latest release.`);
        return response.url.match(/\/releases\/tag\/v?([^/?#]+)$/)?.[1];
      },
      download: async (target: string) => {
        const architecture = app.runningUnderARM64Translation ? "arm64" : process.arch;
        stagedUpdate = await stageScriptUpdate(
          updateRepository,
          target,
          architecture,
          app.getPath("userData"),
        );
      },
      install: async (target: string) => {
        if (stagedUpdate?.version !== target)
          throw new Error("Download and verify this release before applying it.");
        const script = stagedUpdate.script;
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          CITROPY_RELAUNCH: "1",
          CITROPY_PARENT_PID: String(process.pid),
          CITROPY_VERSION: target,
          CITROPY_STAGED_DOWNLOAD: stagedUpdate.directory,
        };
        for (const name of [
          "CITROPY_BASE_URL",
          "CITROPY_BIN_DIR",
          "CITROPY_BIN_PATH",
          "CITROPY_APP_DIR",
        ])
          delete env[name];
        if (process.platform === "darwin") {
          const directory = resolve(process.execPath, "..", "..", "..", "..");
          try {
            accessSync(directory, constants.W_OK);
          } catch {
            throw new Error(
              `Citropy cannot replace itself in ${directory}. Move the app to your Applications folder and try again.`,
            );
          }
          env.CITROPY_APP_DIR = directory;
        } else if (process.env.APPIMAGE) {
          env.CITROPY_BIN_PATH = process.env.APPIMAGE;
          env.CITROPY_BIN_DIR = resolve(process.env.APPIMAGE, "..");
        }
        const log = openSync(join(app.getPath("userData"), "update.log"), "a");
        const powershell = join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        );
        const child = spawn(
          process.platform === "win32" ? powershell : "/bin/sh",
          process.platform === "win32"
            ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script]
            : [script],
          { detached: true, stdio: ["ignore", log, log], env, windowsHide: true },
        );
        closeSync(log);
        child.unref();
        diagnose("app.quit-requested", { reason: "script-update" });
        app.quit();
      },
    };
    const appImage = process.env.APPIMAGE;
    const appUpdates = createAppUpdater({
      updater: autoUpdater,
      version,
      unavailable: unavailableUpdate,
      external: scriptedUpdates ? scriptInstaller : undefined,
      releaseNotes: (target) => fetchReleaseNotes(updateRepository, target),
      applyInstall:
        process.platform === "linux" && appImage
          ? async (file) => {
              spawnAppImageRelaunch({
                appImage,
                downloadedFile: file,
                parentPid: process.pid,
                logFile: join(app.getPath("userData"), "update.log"),
              });
              diagnose("app.quit-requested", { reason: "appimage-update" });
              app.quit();
            }
          : undefined,
      emit: (state) => {
        if (!window.isDestroyed()) window.webContents.send("updates:state", state);
        if (state.status === "available")
          emit({ type: "update.available", version: state.version });
      },
      prepareInstall: async () => {
        const response = await fetch(new URL("/api/updates/prepare", base), {
          method: "POST",
          headers: { "x-citropy-desktop-token": token },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw Object.assign(new Error("Update is blocked"), {
            userMessage: (await response.json()).error,
          });
        }
        applyingUpdate = true;
        diagnose("app.update-preparing");
        for (const profile of new Set([
          session.defaultSession,
          ...(browser?.tabs.partitions() ?? []).map((partition) =>
            session.fromPartition(partition),
          ),
        ])) {
          await profile.cookies.flushStore();
          profile.flushStorageData();
        }
        await backend?.stop();
        app.releaseSingleInstanceLock();
      },
      recoverInstall: async () => {
        if (!applyingUpdate) return;
        if (!app.requestSingleInstanceLock())
          throw new Error("Another Citropy instance is already open.");
        await backend?.start();
        await fetch(new URL("/api/updates/cancel", base), {
          method: "POST",
          headers: { "x-citropy-desktop-token": token },
          signal: AbortSignal.timeout(10000),
        });
        if (!socket || socket.readyState !== WebSocket.OPEN) connectDesktop();
        applyingUpdate = false;
      },
    });
    updates = appUpdates;
    ipcMain.handle("updates:state", (event) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      return appUpdates.state();
    });
    ipcMain.handle("updates:command", (event, request) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      return appUpdates.command(request);
    });
    ipcMain.handle("updates:history", (event) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      return fetchReleaseHistory(updateRepository);
    });
    const windowState = () => ({
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen(),
      focused: window.isFocused(),
      platform: process.platform,
      development,
      version,
      notifications: Notification.isSupported(),
      electron: process.versions.electron,
    });
    const publishWindow = () => window.webContents.send("window:state", windowState());
    ipcMain.handle("window:state", (event) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      return windowState();
    });
    ipcMain.handle("window:capture", async (event) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      return (await window.webContents.capturePage()).toDataURL();
    });
    const signIn = createSignInView(window);
    ipcMain.handle("connections:sign-in", async (event, id) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      const signedIn = await signIn.open(connections.signInTarget(id));
      return request(signedIn ? "connections.status" : "connections.list", { id, signedIn });
    });
    ipcMain.on("connections:sign-in-bounds", (event, bounds) => {
      if (trusted(event)) signIn.place(bounds);
    });
    ipcMain.on("connections:sign-in-command", (event, command) => {
      if (trusted(event)) signIn.command(command);
    });
    ipcMain.handle("window:open-folder", async (event, path) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      if (typeof path !== "string" || !statSync(path).isDirectory())
        throw new Error(`Not a folder: ${path}`);
      await shell.openExternal(pathToFileURL(path).href);
    });
    ipcMain.handle("window:command", (event, command) => {
      if (!trusted(event)) throw new Error("Unavailable outside Citropy");
      if (command === "minimize") window.minimize();
      else if (command === "maximize") {
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
      } else if (command === "close") window.close();
      else if (command === "reload") window.webContents.reload();
      else if (command === "restart") {
        if (process.env.APPIMAGE) {
          spawnAppImageRelaunch({
            appImage: process.env.APPIMAGE,
            parentPid: process.pid,
            logFile: join(app.getPath("userData"), "update.log"),
          });
          app.releaseSingleInstanceLock();
        } else app.relaunch();
        diagnose("app.quit-requested", { reason: "restart" });
        app.quit();
      } else throw new Error("Unknown window action");
    });
    ipcMain.on("window:titlebar-height", (event, height) => {
      let sender;
      try {
        sender = trusted(event);
      } catch {
        return;
      }
      if (!sender) return;
      if (process.platform !== "darwin" || window.isDestroyed()) return;
      if (!Number.isFinite(height) || height < 24 || height > 200) return;
      const buttonHeight = Number.parseFloat(release()) >= 25 ? 14 : 16;
      window.setWindowButtonPosition({
        x: 15,
        y: Math.round((height - buttonHeight) / 2),
      });
    });
    ipcMain.on("window:background", (event, color) => {
      if (!trusted(event) || typeof color !== "string" || !hexColor.test(color)) return;
      windowBackground = color;
      if (!window.isDestroyed()) window.setBackgroundColor(color);
    });
    for (const event of [
      "maximize",
      "unmaximize",
      "enter-full-screen",
      "leave-full-screen",
      "focus",
      "blur",
    ] as const)
      window.on(event as "maximize", publishWindow);
    // Why: on KDE Wayland Chromium keeps stale off-shade rectangles over the stage background after the window is restored or maximized.
    for (const event of ["show", "restore", "maximize", "unmaximize"] as const)
      window.on(event as "show", () => window.webContents.invalidate());
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== ui.origin) event.preventDefault();
    });
    void window.webContents.setVisualZoomLevelLimits(1, 1);
    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        if (["http:", "https:", "mailto:"].includes(new URL(url).protocol))
          void shell
            .openExternal(url)
            .catch((error) =>
              dialog.showErrorBox("Citropy could not open the link", error.message),
            );
      } catch {}
      return { action: "deny" };
    });
    const tabs = new BrowserTabs({
      window,
      emit,
      trusted,
      activeEnvironment: () => sshEnvironments.activeId,
      closing: () => quitting,
      profiles,
      connections,
    });
    browser = { profiles, connections, tabs };
    connectDesktop = () => {
      const wsUrl = new URL("/socket", base);
      wsUrl.protocol = "ws:";
      wsUrl.searchParams.set("desktop", token);
      const connection = new WebSocket(wsUrl);
      socket = connection;
      connection.on("message", async (raw) => {
        if (socket !== connection) return;
        let message;
        try {
          message = JSON.parse(String(raw));
        } catch (error) {
          logFailure("Reading a message from the Citropy server")(error);
          return;
        }
        try {
          emit({
            id: message.id,
            result: await request(message.method, message.params ?? {}),
          });
        } catch (error) {
          emit({ id: message.id, error: (error as Error).message });
        }
      });
      connection.on("error", () => {
        if (socket === connection && !quitting && !applyingUpdate) {
          diagnose("app.quit-requested", { reason: "backend-connection-error" });
          app.quit();
        }
      });
      connection.on("close", (code) => {
        if (socket === connection && !quitting && !applyingUpdate) {
          diagnose("app.quit-requested", { reason: "backend-disconnected", code });
          app.quit();
        }
      });
    };
    connectDesktop();
    await window.loadURL(ui.href);
  })
  .catch(async (error) => {
    diagnose("app.start-failed");
    process.stderr.write(`${error.message}\n`);
    if (quitting) return;
    if (app.isPackaged && !forcedExit) dialog.showErrorBox("Citropy could not open", error.message);
    await backend?.stop().catch(logFailure("Stopping the Citropy server"));
    app.quit();
  });
