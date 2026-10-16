import type { BrowserAction } from "../../shared/workbench.ts";
import { centre, elementBox, objectIdOf } from "./dom.ts";
import { pressKey as sendKey } from "./keys.ts";
import { findNode } from "./locator.ts";
import { selectContents } from "./page-scripts.ts";
import type { BrowserTab } from "./tab.ts";
import type { Locator, Point } from "./types.ts";

const MAX_TEXT_LENGTH = 100_000;
const MAX_KEY_LENGTH = 100;
// Short text is typed one character at a time while the user watches, so it reads as typing.
const WATCHED_TYPING_LIMIT = 200;
const WATCHED_TYPING_DELAY_MS = 18;

type TypeAction = Extract<BrowserAction, { action: "type" }>;
type ScrollAction = Extract<BrowserAction, { action: "scroll" }>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pointOf(locator: Locator, verb: string): Point {
  const { x, y } = locator;
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error(`Choose an element or valid ${verb} coordinates`);
  return { x: x!, y: y! };
}

function mouse(tab: BrowserTab, type: string, point: Point, details: object = {}) {
  return tab.cdp("Input.dispatchMouseEvent", { type, ...point, ...details });
}

async function tap(tab: BrowserTab, point: Point) {
  try {
    await tab.cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await tab.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    // Dispatching touch events turns mouse-to-touch emulation off, so turn it back on.
    await tab.cdp("Emulation.setEmitTouchEventsForMouse", {
      enabled: true,
      configuration: "mobile",
    });
  }
}

async function mouseClick(tab: BrowserTab, point: Point) {
  await mouse(tab, "mouseMoved", point, { button: "none", buttons: 0 });
  await mouse(tab, "mousePressed", point, { button: "left", clickCount: 1 });
  await mouse(tab, "mouseReleased", point, { button: "left", clickCount: 1 });
}

// Clicks the located element's centre, or the given point. Returns the element, if any.
export async function click(tab: BrowserTab, locator: Locator) {
  const node = await findNode(tab, locator);
  const box = node ? await elementBox(tab, node) : undefined;
  const point = box ? centre(box) : pointOf(locator, "click");
  await tab.pointer.moveTo(point.x, point.y);
  await tab.pointer.press(box);
  if (tab.state.mobile) await tap(tab, point);
  else await mouseClick(tab, point);
  await tab.pointer.release();
  return node;
}

export async function hover(tab: BrowserTab, locator: Locator) {
  const node = await findNode(tab, locator);
  const point = node ? centre(await elementBox(tab, node)) : pointOf(locator, "hover");
  await tab.pointer.moveTo(point.x, point.y);
  await mouse(tab, "mouseMoved", point);
  await tab.pointer.release();
}

// Wheels the page, or the located element, by the action's x and y distances.
export async function scroll(tab: BrowserTab, input: ScrollAction) {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y))
    throw new Error("Invalid scroll distance");
  const point = await scrollPoint(tab, input);
  await tab.pointer.moveTo(point.x, point.y);
  await mouse(tab, "mouseWheel", point, { deltaX: input.x, deltaY: input.y });
  await tab.pointer.release();
}

// The middle of the viewport, or the middle of the element kept just inside the viewport.
async function scrollPoint(tab: BrowserTab, locator: Locator): Promise<Point> {
  const { width, height } = tab.state;
  const node = await findNode(tab, locator);
  if (!node) return { x: width / 2, y: height / 2 };
  const middle = centre(await elementBox(tab, node, { scroll: false }));
  return {
    x: Math.min(Math.max(middle.x, 1), width - 1),
    y: Math.min(Math.max(middle.y, 1), height - 1),
  };
}

// Types into the located field, replacing its contents, or into whatever has focus.
export async function typeText(tab: BrowserTab, input: TypeAction) {
  if (typeof input.text !== "string" || input.text.length > MAX_TEXT_LENGTH)
    throw new Error("Invalid browser text");
  if (input.ref !== undefined || input.selector || input.role) await focusAndSelect(tab, input);
  const content = tab.page();
  if (!tab.pointer.watched() || input.text.length > WATCHED_TYPING_LIMIT) {
    await content.insertText(input.text);
    return;
  }
  for (const character of input.text) {
    await content.insertText(character);
    await sleep(WATCHED_TYPING_DELAY_MS);
  }
}

async function focusAndSelect(tab: BrowserTab, locator: Locator) {
  const node = (await click(tab, locator))!;
  await tab.cdp(
    "Runtime.callFunctionOn",
    { objectId: await objectIdOf(tab, node), functionDeclaration: String(selectContents) },
    node.session,
  );
}

export async function pressKey(tab: BrowserTab, key: unknown) {
  if (typeof key !== "string" || key.length > MAX_KEY_LENGTH) throw new Error("Invalid key");
  sendKey(tab.page(), key);
}
