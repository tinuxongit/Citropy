import type { BrowserAction } from "../../shared/workbench.ts";

export interface LogEntry {
  time: number;
  kind: string;
  level: string;
  text: string;
}

// A page node, a node inside a frame session, or a script object, as CDP commands address them.
export interface DomNode {
  backendNodeId?: number;
  objectId?: string;
  session?: string;
  frameId?: string;
}

// How a browser tool names an element: a snapshot ref, a CSS selector, an accessibility
// role and name, or a point on the page.
export interface Locator {
  ref?: string | number;
  selector?: string;
  role?: string;
  name?: string;
  x?: number;
  y?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// The Citropy server sends these over the token-checked desktop socket.
export interface BrowserRequest {
  id: string;
  input: BrowserAction;
  clear?: boolean;
  selector?: string;
  ref?: string;
  tree?: boolean;
  screenshot?: boolean;
  fullPage?: boolean;
}
