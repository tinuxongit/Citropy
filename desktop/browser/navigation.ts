import type { LoadURLOptions, WebContents } from "electron";
import { pressKey } from "./keys.ts";
import { hasOpenTopLayer, pageCall } from "./page-scripts.ts";
import type { BrowserTab } from "./tab.ts";

const MAX_ADDRESS_LENGTH = 16_000;
// Chromium's net::ERR_ABORTED, reported when a newer navigation replaces a pending one.
export const NAVIGATION_ABORTED = -3;
const SETTLE_DELAY_MS = 200;
const LOAD_TIMEOUT_MS = 10_000;

// Accepts http, https and about:blank. A bare host such as "example.com" gets https.
export function webAddress(raw: unknown) {
  if (typeof raw !== "string" || raw.length > MAX_ADDRESS_LENGTH)
    throw new Error("Enter a valid web address");
  const value = raw.trim();
  const hasScheme = value.includes("://") || value === "about:blank";
  const url = new URL(hasScheme ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol) && url.href !== "about:blank")
    throw new Error("Use an http or https address");
  return url.href;
}

// The web address, or undefined when the text is not one.
export function asWebAddress(raw: unknown) {
  try {
    return webAddress(raw);
  } catch {
    return undefined;
  }
}

// Loads a page. A load that a newer navigation replaced is not an error.
export async function load(content: WebContents, url: string, options?: LoadURLOptions) {
  try {
    await content.loadURL(url, options);
  } catch (error) {
    const { code, errno } = error as { code?: string; errno?: number };
    if (code !== "ERR_ABORTED" && errno !== NAVIGATION_ABORTED) throw error;
  }
}

// Gives an action a moment to start a navigation, then waits for any page load to finish.
export async function settle(tab: BrowserTab) {
  const content = tab.page();
  await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
  if (!content.isLoadingMainFrame()) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, LOAD_TIMEOUT_MS);
    function done() {
      clearTimeout(timer);
      content.off("did-stop-loading", done);
      resolve();
    }
    content.once("did-stop-loading", done);
  });
}

// On a phone, Back closes an open dialog or popover before it leaves the page.
export async function goBack(tab: BrowserTab) {
  if (tab.state.mobile && (await closeTopLayer(tab))) return;
  const history = tab.page().navigationHistory;
  if (!history.canGoBack()) return;
  history.goBack();
  await settle(tab);
}

export async function goForward(tab: BrowserTab) {
  const history = tab.page().navigationHistory;
  if (!history.canGoForward()) return;
  history.goForward();
  await settle(tab);
}

export async function reload(tab: BrowserTab) {
  tab.page().reload();
  await settle(tab);
}

async function closeTopLayer(tab: BrowserTab) {
  const { result } = await tab.cdp("Runtime.evaluate", {
    expression: pageCall(hasOpenTopLayer),
    returnByValue: true,
  });
  if (!result.value) return false;
  pressKey(tab.page(), "Escape");
  return true;
}
