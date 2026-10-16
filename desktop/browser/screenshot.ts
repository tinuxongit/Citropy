import { logFailure } from "../../shared/expected-errors.mjs";
import { behindCover } from "./cover.ts";
import { elementBox } from "./dom.ts";
import type { BrowserTab } from "./tab.ts";
import type { DomNode } from "./types.ts";

const MAX_FULL_PAGE_HEIGHT = 16_000;
const JPEG_QUALITY = 80;

interface VisualViewport {
  pageX: number;
  pageY: number;
  scale: number;
}

// A JPEG of the viewport, the whole page, or one element, as base64.
export async function takeScreenshot(
  tab: BrowserTab,
  scope: DomNode | undefined,
  fullPage: boolean,
): Promise<string | undefined> {
  const { cssVisualViewport: viewport } = await tab.cdp("Page.getLayoutMetrics");
  const clip = await clipFor(tab, scope, fullPage, viewport);
  return behindCover(tab, async () => {
    await tab.pointer.hide();
    try {
      const { data } = await tab.cdp("Page.captureScreenshot", {
        format: "jpeg",
        quality: JPEG_QUALITY,
        fromSurface: true,
        captureBeyondViewport: Boolean(scope) || fullPage,
        clip: { ...clip, scale: viewport.scale },
      });
      return data as string;
    } catch (error) {
      logFailure("Taking a browser screenshot")(error);
      return undefined;
    } finally {
      await tab.pointer.release();
    }
  });
}

async function clipFor(
  tab: BrowserTab,
  scope: DomNode | undefined,
  fullPage: boolean,
  viewport: VisualViewport,
) {
  if (scope) {
    const box = await elementBox(tab, scope, { quad: "border" });
    // Finding the box scrolls the element into view, so read the scroll offset again.
    const { cssVisualViewport: scrolled } = await tab.cdp("Page.getLayoutMetrics");
    return {
      x: box.left + scrolled.pageX,
      y: box.top + scrolled.pageY,
      width: Math.max(1, box.right - box.left),
      height: Math.max(1, box.bottom - box.top),
    };
  }
  if (fullPage) {
    const { cssContentSize } = await tab.cdp("Page.getLayoutMetrics");
    return {
      x: 0,
      y: 0,
      width: cssContentSize.width,
      height: Math.min(cssContentSize.height, MAX_FULL_PAGE_HEIGHT),
    };
  }
  return {
    x: viewport.pageX,
    y: viewport.pageY,
    width: tab.state.width / viewport.scale,
    height: tab.state.height / viewport.scale,
  };
}
