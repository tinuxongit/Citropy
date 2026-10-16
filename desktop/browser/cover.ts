import type { NativeImage } from "electron";
import { logFailure } from "../../shared/expected-errors.mjs";
import { imagePainted, nextPaint, pageCall } from "./page-scripts.ts";
import type { BrowserTab } from "./tab.ts";

const CAPTURE_TIMEOUT_MS = 800;
const COVER_LOAD_TIMEOUT_MS = 300;
const PAINT_TIMEOUT_MS = 500;

// Full-page and element screenshots resize the page, which the user would see flicker.
// While the tab is on screen, the renderer covers it with a still image until the page
// is back to its own size.
export async function behindCover<T>(tab: BrowserTab, work: () => Promise<T>) {
  if (!tab.onScreen) return work();
  const still = (await capture(tab))?.toDataURL();
  if (!still) return work();
  await showCover(tab, still);
  try {
    return await work();
  } finally {
    await restoreViewport(tab);
    await waitForPaint(tab);
    tab.host.window.webContents.send("browser:cover", tab.id, undefined);
  }
}

async function capture(tab: BrowserTab) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<NativeImage>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Screenshot timed out")), CAPTURE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([tab.page().capturePage(), timeout]);
  } catch (error) {
    logFailure("Capturing the browser cover", tab.id)(error);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function showCover(tab: BrowserTab, still: string) {
  const ui = tab.host.window.webContents;
  ui.send("browser:cover", tab.id, still);
  const selector = `[data-browser-cover="${tab.id}"]`;
  await ui
    .executeJavaScript(pageCall(imagePainted, selector, COVER_LOAD_TIMEOUT_MS))
    .catch(logFailure("Waiting for the browser cover", tab.id));
}

async function restoreViewport(tab: BrowserTab) {
  if (!tab.viewport.params) return;
  await tab
    .cdp("Emulation.setDeviceMetricsOverride", tab.viewport.params)
    .catch(logFailure("Restoring the browser viewport", tab.id));
}

async function waitForPaint(tab: BrowserTab) {
  await tab
    .cdp("Runtime.evaluate", {
      expression: pageCall(nextPaint),
      awaitPromise: true,
      timeout: PAINT_TIMEOUT_MS,
    })
    .catch(logFailure("Waiting for the browser to paint", tab.id));
}
