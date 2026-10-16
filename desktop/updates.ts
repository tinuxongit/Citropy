import { gt, valid } from "semver";
import type { AppUpdater } from "electron-updater";
import { logFailure } from "../shared/expected-errors.mjs";
import type { AppUpdateState, ReleaseNoteSection } from "../shared/app-update.ts";

type Action = "check" | "download" | "install";

// Installs releases outside electron-updater, such as the macOS script install.
interface ExternalUpdates {
  check(): Promise<string | undefined>;
  download(version: string): Promise<void>;
  install(version: string): Promise<void>;
}

const STARTUP_CHECK_DELAY_MS = 5000;
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MESSAGES = {
  recoveryFailed: "The update was not applied. Close and reopen Citropy to restart its server.",
  verification: "The download failed verification. Download a fresh copy to try again.",
  noRelease:
    "No release is accessible. Check published Citropy releases and, for private repositories, your GitHub sign-in.",
  failed: {
    install: "The update could not be applied. Citropy has kept the current version.",
    download: "The download could not finish. Check your connection and try again.",
    check: "Could not check for updates. Check your connection and try again.",
  },
  downloaded: "The update is downloaded and verified. Restart Citropy to apply it.",
};

const errorMessage = (error: unknown, action: Action) => {
  const { code, message, userMessage } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
    userMessage?: string;
  };
  const detail = String(message || "");
  const codeText = String(code || "");
  if (codeText.includes("SHA512") || detail.includes("checksum")) return MESSAGES.verification;
  if (/404|403|401|token|release|not found/i.test(`${codeText} ${detail}`))
    return MESSAGES.noRelease;
  if (action === "install" && userMessage) return userMessage;
  return MESSAGES.failed[action];
};

export function createAppUpdater({
  updater: releaseUpdater,
  version,
  unavailable,
  external,
  applyInstall,
  emit,
  prepareInstall,
  recoverInstall = async () => {},
  releaseNotes,
}: {
  updater?: AppUpdater;
  version: string;
  unavailable?: string;
  external?: ExternalUpdates;
  applyInstall?: (file: string) => Promise<void>;
  emit: (state: AppUpdateState) => void;
  prepareInstall: () => Promise<void>;
  recoverInstall?: () => Promise<void>;
  releaseNotes?: (version: string) => Promise<ReleaseNoteSection[]>;
}) {
  let state: AppUpdateState = {
    status: unavailable ? "unsupported" : "idle",
    currentVersion: version,
    message: unavailable,
  };
  let operation: Action | undefined;
  let disposed = false;
  let recovering: Promise<void> | undefined;
  // Only read when updates are available and no external installer handles them, which is when the caller passes one.
  const updater = releaseUpdater as AppUpdater;
  let downloadedFile: string | undefined;
  const listeners: Array<() => void> = [];
  const publish = (patch: Partial<AppUpdateState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    emit({ ...state });
  };
  const fail = async (error: unknown, action: Action) => {
    if (disposed || recovering) return;
    if (action === "install") {
      recovering = recoverInstall();
      try {
        await recovering;
      } catch (recoveryError) {
        logFailure("Recovering from the update")(recoveryError);
        publish({ status: "error", retry: "install", message: MESSAGES.recoveryFailed });
        recovering = undefined;
        return;
      }
      recovering = undefined;
    }
    publish({ status: "error", retry: action, message: errorMessage(error, action) });
  };
  const loadNotes = (target: string | undefined) => {
    if (!releaseNotes || !target || state.notes?.version === target) return;
    releaseNotes(target).then(
      (sections) => {
        if (sections.length) publish({ notes: { version: target, sections } });
      },
      (error: unknown) => publish({ notesError: String((error as Error)?.message || error) }),
    );
  };
  const publishAvailability = (latest?: string) => {
    if (!latest || !valid(latest) || !gt(latest, version)) {
      publish({
        status: "current",
        version: undefined,
        checkedAt: Date.now(),
        message: undefined,
      });
      return;
    }
    publish({
      status: "available",
      version: latest,
      checkedAt: Date.now(),
      percent: undefined,
      message: undefined,
    });
    loadNotes(latest);
  };
  const listen: AppUpdater["on"] = (name, handler) => {
    updater.on(name, handler);
    listeners.push(() => updater.off(name, handler));
    return updater;
  };
  if (!unavailable && !external) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableWebInstaller = true;
    updater.logger = null;
    listen("update-available", (info) => publishAvailability(info.version));
    listen("update-not-available", () => publishAvailability());
    listen("download-progress", (progress) => {
      if (state.status !== "downloading") return;
      publish({
        percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    });
    listen("update-downloaded", (info) => {
      if (state.status !== "downloading" || info.version !== state.version) return;
      downloadedFile = info.downloadedFile;
      publish({ status: "ready", percent: 100, message: undefined });
    });
    listen("error", (error) => {
      void fail(error, operation || "check");
    });
  }
  const command = async (request: unknown) => {
    const action =
      typeof request === "string" ? request : (request as { action?: unknown } | undefined)?.action;
    if (disposed || unavailable || operation || recovering) return { ...state };
    if (action !== "check" && action !== "download" && action !== "install")
      throw new Error("Unknown update action");
    if (action === "check" && ["ready", "downloading", "installing"].includes(state.status))
      return { ...state };
    if (
      action === "download" &&
      state.status !== "available" &&
      !(state.status === "error" && state.retry === "download")
    )
      throw new Error("Check for a new release before downloading.");
    if (
      action === "install" &&
      state.status !== "ready" &&
      !(state.status === "error" && state.retry === "install")
    )
      throw new Error("Download and verify the update before applying it.");
    operation = action;
    publish({
      status:
        action === "check" ? "checking" : action === "download" ? "downloading" : "installing",
      message: undefined,
      retry: undefined,
      ...(action === "download"
        ? {
            percent: 0,
            transferred: 0,
            total: undefined,
            bytesPerSecond: undefined,
          }
        : {}),
    });
    void (async () => {
      try {
        if (action === "check" && external) {
          publishAvailability(await external.check());
        } else if (action === "check") {
          const result = await updater.checkForUpdates();
          if (!result) throw new Error("No release feed is available");
        } else if (action === "download" && external) {
          await external.download(state.version ?? "");
          publish({
            status: "ready",
            percent: 100,
            message: MESSAGES.downloaded,
          });
        } else if (action === "download") {
          await updater.downloadUpdate();
          if (state.status === "downloading")
            throw new Error("The download did not pass verification");
        } else {
          await prepareInstall();
          if (external) await external.install(state.version ?? "");
          else if (applyInstall) {
            if (typeof downloadedFile !== "string" || !downloadedFile)
              throw new Error("The downloaded update file is missing.");
            await applyInstall(downloadedFile);
          } else updater.quitAndInstall(false, true);
        }
      } catch (error) {
        await fail(error, action);
      } finally {
        operation = undefined;
      }
    })();
    return { ...state };
  };
  const startup = unavailable
    ? undefined
    : setTimeout(() => void command("check"), STARTUP_CHECK_DELAY_MS);
  const interval = unavailable
    ? undefined
    : setInterval(() => {
        if (["idle", "current", "available"].includes(state.status)) void command("check");
      }, RECHECK_INTERVAL_MS);
  loadNotes(version);
  startup?.unref();
  interval?.unref();
  return {
    state: () => ({ ...state }),
    command,
    dispose() {
      disposed = true;
      clearTimeout(startup);
      clearInterval(interval);
      for (const remove of listeners) remove();
    },
  };
}
