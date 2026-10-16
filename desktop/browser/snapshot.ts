import { findNode } from "./locator.ts";
import { includeFrames } from "./frame-tree.ts";
import { takeScreenshot } from "./screenshot.ts";
import { formatTree } from "./snapshot-tree.ts";
import type { BrowserTab } from "./tab.ts";
import type { BrowserRequest, DomNode } from "./types.ts";

const MAX_TREE_LENGTH = 28_000;

// The page as text for an agent: title, address, viewport and the accessibility tree with
// refs, plus a screenshot when asked. A selector or ref limits it to one element.
export async function takeSnapshot(tab: BrowserTab, request: BrowserRequest) {
  await tab.prepareForInput();
  const scope = await snapshotScope(tab, request);
  const nodes =
    request.tree === false
      ? []
      : await includeFrames(tab, (await tab.cdp("Accessibility.getFullAXTree")).nodes);
  const tree = formatTree(nodes, scope && refOf(tab, scope)).join("\n");
  const image =
    request.screenshot === true
      ? await takeScreenshot(tab, scope, request.fullPage === true)
      : undefined;
  return { text: `${header(tab)}\n\n${truncated(tree)}`, image };
}

async function snapshotScope(tab: BrowserTab, request: BrowserRequest) {
  if (request.selector !== undefined) {
    const node = await findNode(tab, { selector: request.selector });
    if (!node) throw new Error("Enter a selector to snapshot");
    const { node: described } = await tab.cdp("DOM.describeNode", node);
    return { ...node, backendNodeId: described.backendNodeId as number };
  }
  if (request.ref !== undefined) return (await findNode(tab, { ref: request.ref })) ?? undefined;
  return undefined;
}

// The scope's ref as the tree names it: "123" in the page, "f2.123" in frame session f2.
function refOf(tab: BrowserTab, scope: DomNode) {
  if (!scope.session) return scope.backendNodeId;
  return `${tab.frames.keyOfSession(scope.session)}.${scope.backendNodeId}`;
}

function header(tab: BrowserTab) {
  const content = tab.page();
  const { width, height, mobile } = tab.state;
  const errors = tab.logs.filter((entry) => entry.level === "error").length;
  const unread = errors ? ` ${errors} unread error${errors === 1 ? "" : "s"} in browser_logs.` : "";
  const viewport =
    `Viewport: ${width} × ${height} (${mobile ? "mobile" : "desktop"}). ` +
    "Screenshot coordinates use these dimensions. Use [ref=N] values with browser_action ref." +
    unread;
  return [content.getTitle(), content.getURL(), viewport].join("\n");
}

function truncated(tree: string) {
  if (tree.length <= MAX_TREE_LENGTH) return tree;
  return `${tree.slice(0, MAX_TREE_LENGTH)}\n… truncated. Snapshot a selector or ref to see the rest.`;
}
