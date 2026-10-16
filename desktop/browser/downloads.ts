import { app, type DownloadItem, type Session, type WebContents } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { BrowserTab } from "./tab.ts";

const watchedSessions = new WeakSet<Session>();

// "report.pdf" becomes "report (1).pdf", then "report (2).pdf", until the name is free.
function uniquePath(directory: string, name: string) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 0; ; index++) {
    const candidate = join(directory, index ? `${stem} (${index})${extension}` : name);
    if (!existsSync(candidate)) return candidate;
  }
}

function logOutcome(tab: BrowserTab, item: DownloadItem, path: string, outcome: string) {
  if (outcome === "completed")
    tab.log(
      "download",
      "info",
      `Downloaded ${item.getURL()} to ${path} (${item.getReceivedBytes()} bytes)`,
    );
  else tab.log("download", "error", `Download ${outcome}: ${item.getURL()}`);
}

// Saves a profile's downloads to Downloads/Citropy and logs them on the tab that started them.
export function saveDownloads(
  browserSession: Session,
  tabOf: (contents: WebContents) => BrowserTab | undefined,
) {
  if (watchedSessions.has(browserSession)) return;
  watchedSessions.add(browserSession);
  browserSession.on("will-download", (_, item, contents) => {
    const tab = tabOf(contents);
    const directory = join(app.getPath("downloads"), "Citropy");
    mkdirSync(directory, { recursive: true });
    const path = uniquePath(directory, basename(item.getFilename()) || "download");
    item.setSavePath(path);
    item.once("done", (_, outcome) => {
      if (tab) logOutcome(tab, item, path, outcome);
    });
  });
}
