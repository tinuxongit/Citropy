import { useApp } from "./store.ts";

const MIN_HEIGHT = 48;
const MAX_HEIGHT = 1600;
const THEME_VARIABLES: Record<string, string> = {
  "--citropy-background": "--canvas",
  "--citropy-surface": "--raised-solid",
  "--citropy-text": "--text",
  "--citropy-muted": "--text-2",
  "--citropy-line": "--line-strong",
  "--citropy-accent": "--accent",
  "--citropy-font-ui": "--font-ui",
  "--citropy-font-mono": "--font-mono",
};

const UI_FONT = {
  family: "Citropy Sans",
  url: "/fonts/CitropySans.woff2",
  descriptors: { weight: "300 800", style: "oblique 0deg 10deg" },
};
let uiFontSource: Promise<ArrayBuffer> | undefined;

function loadUiFont(): Promise<ArrayBuffer> {
  uiFontSource ??= fetch(UI_FONT.url).then((response) => {
    if (!response.ok) throw new Error(`Loading ${UI_FONT.family} failed with status ${response.status}`);
    return response.arrayBuffer();
  });
  return uiFontSource;
}

function frames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>("iframe.markdown-visual")];
}

function sendTheme(frame: HTMLIFrameElement): void {
  const style = getComputedStyle(document.documentElement);
  frame.contentWindow?.postMessage({
    type: "citropy-theme",
    scheme: useApp.getState().scheme,
    variables: Object.fromEntries(Object.entries(THEME_VARIABLES).map(([name, source]) => [name, style.getPropertyValue(source).trim()])),
  }, "*");
}

async function sendFont(frame: HTMLIFrameElement): Promise<void> {
  const source = await loadUiFont();
  frame.contentWindow?.postMessage({ type: "citropy-font", family: UI_FONT.family, source, descriptors: UI_FONT.descriptors }, "*");
}

export function connectVisual(frame: HTMLIFrameElement): void {
  sendTheme(frame);
  void sendFont(frame);
}

addEventListener("message", (event) => {
  if (event.data?.type !== "citropy-visual-height" || typeof event.data.height !== "number") return;
  const frame = frames().find(entry => entry.contentWindow === event.source);
  if (!frame) return;
  const height = Math.ceil(event.data.height);
  frame.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))}px`;
  frame.contentWindow?.postMessage({ type: "citropy-visual-scrolls", scrolls: height > MAX_HEIGHT }, "*");
});

new MutationObserver(() => requestAnimationFrame(() => frames().forEach(sendTheme)))
  .observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme", "data-scheme"] });
