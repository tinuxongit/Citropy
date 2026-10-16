import type { BrowserTab } from "./tab.ts";
import type { Box, DomNode, Point } from "./types.ts";

// The fields of a node that CDP DOM commands accept.
export function nodeParams(node: DomNode) {
  const { session: _session, frameId: _frameId, ...params } = node;
  return params;
}

// The script object id for a node, which Runtime.callFunctionOn needs.
export async function objectIdOf(tab: BrowserTab, node: DomNode): Promise<string> {
  if (node.objectId) return node.objectId;
  const { object } = await tab.cdp("DOM.resolveNode", nodeParams(node), node.session);
  return object.objectId;
}

// The element's box in page viewport coordinates, including the offset of its frame.
export async function elementBox(
  tab: BrowserTab,
  node: DomNode,
  { scroll = true, quad = "content" }: { scroll?: boolean; quad?: "content" | "border" } = {},
): Promise<Box> {
  if (scroll) await tab.cdp("DOM.scrollIntoViewIfNeeded", nodeParams(node), node.session);
  const { model } = await tab.cdp("DOM.getBoxModel", nodeParams(node), node.session);
  const points: number[] = model[quad];
  const xs = [points[0]!, points[2]!, points[4]!, points[6]!];
  const ys = [points[1]!, points[3]!, points[5]!, points[7]!];
  const offset = node.frameId ? await frameOffset(tab, node.frameId) : { x: 0, y: 0 };
  return {
    left: Math.min(...xs) + offset.x,
    top: Math.min(...ys) + offset.y,
    right: Math.max(...xs) + offset.x,
    bottom: Math.max(...ys) + offset.y,
  };
}

async function frameOffset(tab: BrowserTab, frameId: string): Promise<Point> {
  const owner = await tab.cdp("DOM.getFrameOwner", { frameId });
  const { model } = await tab.cdp("DOM.getBoxModel", { backendNodeId: owner.backendNodeId });
  return { x: model.content[0], y: model.content[1] };
}

export function centre(box: Box): Point {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}
