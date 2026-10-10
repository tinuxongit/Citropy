import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { ifMissing } from "../shared/expected-errors.mjs";
import { toolAssetDirectory } from "./tool-images.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_VISUAL_BYTES = 512 * 1024;
const SIZE_LIMIT = "Visual replies can be up to 512 KiB. Embed smaller images.";
const VISUAL_ID = /^[0-9a-f-]{36}$/;
const STORED_ID = /^(draft-)?[0-9a-f-]{36}$/;
const VISUAL_POLICY = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
].join("; ");

const FRAME_SETUP = `<base target="_blank"><style>:root{color-scheme:light dark}html{background:transparent;overflow-y:hidden}html[data-scrolls]{overflow-y:auto}body{margin:0;color:var(--citropy-text);font-family:var(--citropy-font-ui),system-ui,sans-serif}</style><script>(()=>{const root=document.documentElement;addEventListener("message",event=>{if(event.source!==parent)return;const message=event.data;if(message?.type==="citropy-font")document.fonts.add(new FontFace(message.family,message.source,message.descriptors));if(message?.type==="citropy-visual-scrolls")root.toggleAttribute("data-scrolls",message.scrolls);if(message?.type!=="citropy-theme")return;for(const[name,value]of Object.entries(message.variables))root.style.setProperty(name,value);root.style.colorScheme=message.scheme;root.dataset.theme=message.scheme});const report=()=>parent.postMessage({type:"citropy-visual-height",height:root.offsetHeight},"*");new ResizeObserver(report).observe(root)})()</script>`;

function visualPath(threadId: string, id: string): string | null {
  const directory = toolAssetDirectory(threadId);
  return directory && join(directory, `${id}.html`);
}

function storedPath(threadId: string, id: string): string {
  if (!STORED_ID.test(id)) throw new Error("Unknown visual. Use an id returned by workspace_visual or workspace_visual_draft.");
  const path = visualPath(threadId, id);
  if (!path) throw new Error("Conversation not found.");
  return path;
}

export async function saveToolVisual(threadId: string, html: string): Promise<string> {
  if (!html.trim()) throw new Error("Write the page HTML first.");
  if (Buffer.byteLength(html) > MAX_VISUAL_BYTES) throw new Error(SIZE_LIMIT);
  const id = randomUUID();
  const path = storedPath(threadId, id);
  await mkdir(toolAssetDirectory(threadId)!, { recursive: true, mode: 0o700 });
  await writeFile(path, html, { mode: 0o600 });
  return id;
}

export async function readToolVisual(threadId: string, id: string): Promise<string> {
  const html = await readFile(storedPath(threadId, id), "utf8").catch(ifMissing(undefined));
  if (html === undefined) throw new Error(`Visual ${id} was not found in this conversation.`);
  return html;
}

export async function appendVisualDraft(threadId: string, html: string, existing?: string): Promise<{ draft: string; bytes: number }> {
  if (existing && !existing.startsWith("draft-")) throw new Error("Only drafts can be added to. Change a shown visual with workspace_visual, from, and edits.");
  const draft = existing ?? `draft-${randomUUID()}`;
  const path = storedPath(threadId, draft);
  const bytes = existing ? (await stat(path).catch(ifMissing(undefined)))?.size : 0;
  if (bytes === undefined) throw new Error(`Draft ${draft} was not found in this conversation.`);
  const total = bytes + Buffer.byteLength(html);
  if (total > MAX_VISUAL_BYTES) throw new Error(SIZE_LIMIT);
  await mkdir(toolAssetDirectory(threadId)!, { recursive: true, mode: 0o700 });
  await appendFile(path, html, { mode: 0o600 });
  return { draft, bytes: total };
}

export async function removeVisualDraft(threadId: string, draft: string): Promise<void> {
  if (draft.startsWith("draft-")) await rm(storedPath(threadId, draft));
}

export interface VisualEdit { find: string; replace: string }

export function editVisual(html: string, edits: VisualEdit[]): string {
  return edits.reduce((page, { find, replace }, index) => {
    const at = page.indexOf(find);
    if (!find || at < 0) throw new Error(`Edit ${index + 1} did not match. Copy find exactly from workspace_visual_source.`);
    if (page.indexOf(find, at + 1) >= 0) throw new Error(`Edit ${index + 1} matches more than once. Include more surrounding text in find.`);
    return page.slice(0, at) + replace + page.slice(at + find.length);
  }, html);
}

export function framedVisual(html: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? "";
  return `${doctype.trim() || "<!doctype html>"}${FRAME_SETUP}${html.slice(doctype.length)}`;
}

export async function serveToolVisual(req: IncomingMessage, res: ServerResponse, params: URLSearchParams): Promise<void> {
  const threadId = params.get("threadId") ?? "";
  const id = params.get("id") ?? "";
  const path = /^[\w-]{1,120}$/.test(threadId) && VISUAL_ID.test(id) ? visualPath(threadId, id) : null;
  const html = path && await readFile(path, "utf8").catch(ifMissing(undefined));
  if (!html) {
    res.writeHead(404, { "cache-control": "private, max-age=60" }).end();
    return;
  }
  const body = Buffer.from(framedVisual(html));
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": "private, no-cache" }).end();
    return;
  }
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length,
    "cache-control": "private, no-cache",
    etag,
    "x-content-type-options": "nosniff",
    "content-security-policy": VISUAL_POLICY,
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}
