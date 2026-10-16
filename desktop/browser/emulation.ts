import type { BrowserAction } from "../../shared/workbench.ts";
import { load } from "./navigation.ts";
import type { BrowserTab } from "./tab.ts";

const MIN_WIDTH = 320;
const MAX_WIDTH = 3840;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 2160;

type ResizeAction = Extract<BrowserAction, { action: "resize" }>;
type EmulateAction = Extract<BrowserAction, { action: "emulate" }>;

const mediaValues = {
  colorScheme: ["light", "dark"],
  reducedMotion: ["reduce", "no-preference"],
};

// Sends the tab's size to the page, unless the page already has it.
export function applyViewport(tab: BrowserTab) {
  const { width, height } = tab.state;
  const mobile = Boolean(tab.state.mobile);
  const key = JSON.stringify([width, height, mobile]);
  if (key === tab.viewport.key && tab.viewport.applied) return tab.viewport.applied;
  const landscape = width > height;
  const params = {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 1,
    mobile,
    screenOrientation: {
      type: landscape ? "landscapePrimary" : "portraitPrimary",
      angle: landscape ? 90 : 0,
    },
  };
  const applied = tab.cdp("Emulation.setDeviceMetricsOverride", params);
  tab.viewport = { key, params, applied };
  return applied;
}

// An Android Chrome user agent that matches Electron's Chromium version.
function mobileUserAgent() {
  const chrome = process.versions.chrome;
  const major = chrome.split(".")[0]!;
  const brands = (version: string) => [
    { brand: "Chromium", version },
    { brand: "Google Chrome", version },
  ];
  return {
    override: {
      userAgent: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`,
      platform: "Linux armv8l",
      userAgentMetadata: {
        brands: brands(major),
        fullVersionList: brands(chrome),
        platform: "Android",
        platformVersion: "10.0.0",
        architecture: "arm",
        bitness: "64",
        model: "K",
        mobile: true,
        formFactors: ["Mobile"],
      },
    },
    headers: {
      "Sec-CH-UA": `"Chromium";v="${major}", "Google Chrome";v="${major}"`,
      "Sec-CH-UA-Mobile": "?1",
      "Sec-CH-UA-Platform": '"Android"',
    },
  };
}

// Mobile mode looks like a phone to the site: its user agent, client hints and touch input.
export async function applyMobileMode(tab: BrowserTab) {
  const mobile = Boolean(tab.state.mobile);
  const phone = mobile ? mobileUserAgent() : undefined;
  await tab.cdp("Emulation.setUserAgentOverride", phone?.override ?? { userAgent: "" });
  await tab.cdp("Network.setExtraHTTPHeaders", { headers: phone?.headers ?? {} });
  await tab.cdp("Emulation.setTouchEmulationEnabled", {
    enabled: mobile,
    maxTouchPoints: mobile ? 5 : 1,
  });
  await tab.cdp("Emulation.setEmitTouchEventsForMouse", {
    enabled: mobile,
    configuration: mobile ? "mobile" : "desktop",
  });
}

export async function resize(tab: BrowserTab, input: ResizeAction) {
  const { width, height } = input;
  const validWidth = Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH;
  const validHeight = Number.isInteger(height) && height >= MIN_HEIGHT && height <= MAX_HEIGHT;
  if (!validWidth || !validHeight)
    throw new Error(
      `Use a width from ${MIN_WIDTH} to ${MAX_WIDTH} and a height from ${MIN_HEIGHT} to ${MAX_HEIGHT} pixels.`,
    );
  if (input.mobile !== undefined && typeof input.mobile !== "boolean")
    throw new Error("Mobile mode must be true or false.");
  const mobile = input.mobile ?? Boolean(tab.state.mobile);
  const changedMode = mobile !== Boolean(tab.state.mobile);
  Object.assign(tab.state, { width, height, mobile });
  tab.host.publishGuests();
  await applyViewport(tab);
  if (changedMode) await reloadInMode(tab);
}

// Sites pick their mobile or desktop layout when the page loads, so reload it uncached.
async function reloadInMode(tab: BrowserTab) {
  await applyMobileMode(tab);
  const content = tab.page();
  const url = content.getURL();
  if (!url || url === "about:blank") return;
  await load(content, url, { extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n" });
}

export async function emulateMedia(tab: BrowserTab, input: EmulateAction) {
  for (const key of ["colorScheme", "reducedMotion"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value !== "none" && !mediaValues[key].includes(value))
      throw new Error(`${key} must be ${mediaValues[key].join(", ")} or none`);
    tab.media[key] = value === "none" ? "" : value;
  }
  await tab.cdp("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: tab.media.colorScheme },
      { name: "prefers-reduced-motion", value: tab.media.reducedMotion },
    ],
  });
  const colorScheme = tab.media.colorScheme || "system";
  const reducedMotion = tab.media.reducedMotion || "system";
  return `Emulating color scheme ${colorScheme} and reduced motion ${reducedMotion}`;
}
