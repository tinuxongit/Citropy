import type { AXNode } from "./snapshot-tree.ts";
import { pageCall, querySingle } from "./page-scripts.ts";
import type { BrowserTab } from "./tab.ts";
import type { DomNode, Locator } from "./types.ts";

// Finds the element a locator names, or null when it names a point instead.
export async function findNode(tab: BrowserTab, locator: Locator): Promise<DomNode | null> {
  if (locator.ref !== undefined) return nodeFromRef(tab, String(locator.ref));
  if (locator.selector) return nodeFromSelector(tab, locator.selector);
  if (locator.role) return nodeFromRole(tab, locator.role, locator.name);
  return null;
}

// Refs look like "123" for the page or "f2.123" for a node inside frame session f2.
async function nodeFromRef(tab: BrowserTab, ref: string): Promise<DomNode> {
  const [frameKey, id] = ref.includes(".") ? ref.split(".") : [undefined, ref];
  const backendNodeId = Number(id);
  const frame = frameKey ? tab.frames.get(frameKey) : undefined;
  if (!Number.isInteger(backendNodeId) || (frameKey && !frame))
    throw new Error("Use a ref from the latest snapshot");
  const node = frame
    ? { backendNodeId, session: frame.sessionId, frameId: frame.targetId }
    : { backendNodeId };
  await tab.cdp("DOM.describeNode", { backendNodeId }, frame?.sessionId).catch(() => {
    throw new Error("That element is no longer on the page. Take a new snapshot for current refs.");
  });
  return node;
}

async function nodeFromSelector(tab: BrowserTab, selector: string): Promise<DomNode> {
  const { result, exceptionDetails } = await tab.cdp("Runtime.evaluate", {
    expression: pageCall(querySingle, selector),
  });
  if (exceptionDetails)
    throw new Error(exceptionDetails.exception?.description ?? "Element not found");
  return { objectId: result.objectId };
}

async function nodeFromRole(
  tab: BrowserTab,
  role: string,
  name: string | undefined,
): Promise<DomNode> {
  const { nodes }: { nodes: AXNode[] } = await tab.cdp("Accessibility.getFullAXTree");
  const matches = nodes.filter(
    (node) =>
      !node.ignored &&
      node.role?.value === role &&
      (name === undefined || normalize(node.name?.value) === normalize(name)),
  );
  const match = matches.length === 1 ? matches[0] : undefined;
  if (!match?.backendDOMNodeId)
    throw new Error("Choose a role and name that match exactly one element");
  return { backendNodeId: match.backendDOMNodeId };
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}
