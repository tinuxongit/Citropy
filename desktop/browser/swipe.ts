import type { BrowserAction } from "../../shared/workbench.ts";
import type { BrowserTab } from "./tab.ts";
import type { Point } from "./types.ts";

const DEFAULT_DURATION_MS = 300;
const MAX_DURATION_MS = 5000;
const STEP_MS = 16;

type SwipeAction = Extract<BrowserAction, { action: "swipe" }>;
type DragData = { items?: Array<{ mimeType: string }> };

// A straight path from start to end, cut into evenly timed steps.
class SwipePath {
  readonly steps: number;
  readonly #from: Point;
  readonly #to: Point;
  readonly #stepMs: number;

  constructor(input: SwipeAction, duration: number) {
    this.#from = { x: input.x, y: input.y };
    this.#to = { x: input.toX, y: input.toY };
    this.steps = Math.max(2, Math.round(duration / STEP_MS));
    this.#stepMs = duration / this.steps;
  }

  at(step: number): Point {
    const progress = step / this.steps;
    return {
      x: this.#from.x + (this.#to.x - this.#from.x) * progress,
      y: this.#from.y + (this.#to.y - this.#from.y) * progress,
    };
  }

  // Waits one step, drawing the pointer at the step first when one is given.
  async pause(tab: BrowserTab, step?: number) {
    if (step !== undefined) {
      const point = this.at(step);
      await tab.pointer.drawAt(point.x, point.y, true);
    }
    await new Promise((resolve) => setTimeout(resolve, this.#stepMs));
  }
}

function validDuration(input: SwipeAction) {
  const { x, y, toX, toY } = input;
  if (![x, y, toX, toY].every(Number.isFinite))
    throw new Error("A swipe needs x, y, toX and toY coordinates");
  const duration = input.duration ?? DEFAULT_DURATION_MS;
  if (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_MS)
    throw new Error(`Use a swipe duration from 0 to ${MAX_DURATION_MS} milliseconds`);
  return duration;
}

// Swipes with a finger in mobile mode and drags with the mouse otherwise. A mouse drag
// that picks up draggable content drops it at the end point.
export async function swipe(tab: BrowserTab, input: SwipeAction) {
  const path = new SwipePath(input, validDuration(input));
  await tab.pointer.moveTo(input.x, input.y);
  if (tab.state.mobile) {
    await touchSwipe(tab, path);
    return undefined;
  }
  const dragged = await mouseDrag(tab, path, { x: input.toX, y: input.toY });
  if (!dragged) return undefined;
  const types = dragged.items?.map((item) => item.mimeType).join(", ") || "content";
  return `Dragged ${types} and dropped it at the end point`;
}

async function touchSwipe(tab: BrowserTab, path: SwipePath) {
  const touch = (type: string, touchPoints: Point[]) =>
    tab.cdp("Input.dispatchTouchEvent", { type, touchPoints });
  await touch("touchStart", [path.at(0)]);
  for (let step = 1; step <= path.steps; step++) {
    await path.pause(tab, step);
    await touch("touchMove", [path.at(step)]);
  }
  await touch("touchEnd", []);
  await tab.pointer.release();
}

// Returns the dragged data when the page started a drag, which Chromium hands to CDP
// instead of running its own drag and drop.
async function mouseDrag(tab: BrowserTab, path: SwipePath, end: Point) {
  const mouse = (type: string, point: Point, details: object) =>
    tab.cdp("Input.dispatchMouseEvent", { type, ...point, ...details });
  const debuggerApi = tab.page().debugger;
  let dragData: DragData | undefined;
  const intercept = (_: unknown, method: string, params: { data?: DragData }) => {
    if (method === "Input.dragIntercepted") dragData = params.data;
  };
  debuggerApi.on("message", intercept);
  await tab.cdp("Input.setInterceptDrags", { enabled: true });
  try {
    await mouse("mouseMoved", path.at(0), { button: "none", buttons: 0 });
    await path.pause(tab);
    await mouse("mousePressed", path.at(0), { button: "left", buttons: 1, clickCount: 1 });
    for (let step = 1; step <= path.steps; step++) {
      await path.pause(tab, step);
      await mouse("mouseMoved", path.at(step), { button: "left", buttons: 1 });
    }
    if (dragData)
      for (const type of ["dragEnter", "dragOver", "drop"])
        await tab.cdp("Input.dispatchDragEvent", { type, ...end, data: dragData });
    await mouse("mouseReleased", path.at(path.steps), {
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    debuggerApi.off("message", intercept);
    await tab.cdp("Input.setInterceptDrags", { enabled: false });
    await tab.pointer.release();
  }
  return dragData;
}
