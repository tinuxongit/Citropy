import { logFailure } from "../../shared/expected-errors.mjs";
import type { AXNode } from "./snapshot-tree.ts";
import type { BrowserTab } from "./tab.ts";

type FrameNode = AXNode & { parentId?: string; session?: string; refPrefix?: string };

// A page's accessibility tree stops at its iframes. This reads each iframe's own tree and
// hangs it under the iframe node, so a snapshot shows the whole page.
export async function includeFrames(tab: BrowserTab, nodes: FrameNode[]) {
  const all = [...nodes];
  const queue = [...nodes];
  while (queue.length) {
    const node = queue.shift()!;
    if (node.role?.value !== "Iframe" || !node.backendDOMNodeId) continue;
    const inner = await readFrame(tab, node);
    if (!inner) continue;
    const root = inner.find((entry) => !entry.parentId) ?? inner[0]!;
    node.childIds = [...(node.childIds ?? []), root.nodeId];
    all.push(...inner);
    queue.push(...inner);
  }
  return all;
}

async function readFrame(tab: BrowserTab, iframe: FrameNode) {
  const described = await tab
    .cdp("DOM.describeNode", { backendNodeId: iframe.backendDOMNodeId }, iframe.session)
    .catch(logFailure("Reading a browser frame"));
  const frameId: string | undefined = described?.node?.frameId;
  if (!frameId) return undefined;
  let nodes = await accessibilityTree(tab, frameId, { frameId }, iframe.session);
  // An out-of-process frame comes back empty or as a bare root through its parent's
  // session, so it is read again through its own.
  const ownSession = nodes && nodes.length > 1 ? undefined : tab.frames.findByTarget(frameId);
  if (ownSession) nodes = await accessibilityTree(tab, frameId, {}, ownSession.sessionId);
  if (!nodes?.length) return undefined;
  const session = ownSession?.sessionId ?? iframe.session;
  const refPrefix = ownSession ? `${ownSession.key}.` : (iframe.refPrefix ?? "");
  return nodes.map((node) => inFrame(node, frameId, session, refPrefix));
}

async function accessibilityTree(
  tab: BrowserTab,
  frameId: string,
  params: object,
  sessionId: string | undefined,
): Promise<FrameNode[] | undefined> {
  const result = await tab
    .cdp("Accessibility.getFullAXTree", params, sessionId)
    .catch(logFailure("Reading a browser frame", frameId));
  return result?.nodes;
}

// Node ids are only unique within one frame, so they get the frame id in front. Refs
// inside a frame session get its key in front, such as "f2.123", so actions can find them.
function inFrame(
  node: FrameNode,
  frameId: string,
  session: string | undefined,
  refPrefix: string,
): FrameNode {
  const scoped = (id: string) => `${frameId}:${id}`;
  return {
    ...node,
    nodeId: scoped(node.nodeId),
    ...(node.parentId ? { parentId: scoped(node.parentId) } : {}),
    childIds: (node.childIds ?? []).map(scoped),
    ...(node.backendDOMNodeId && refPrefix ? { ref: `${refPrefix}${node.backendDOMNodeId}` } : {}),
    ...(session ? { session, refPrefix } : {}),
  };
}
