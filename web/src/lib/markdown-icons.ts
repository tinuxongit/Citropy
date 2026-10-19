import { createElement, type ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BookIcon } from "../components/icons/BookIcon.tsx";
import { GlobeIcon } from "../components/icons/GlobeIcon.tsx";
import { CopyIcon } from "../components/icons/actions.tsx";
import { CheckIcon } from "../components/icons/marks.tsx";
import { FileIcon } from "../components/icons/FileIcon.tsx";
import { fileTypeFor, type FileType } from "./file-type.ts";
import { PlayIcon } from "../components/icons/media.tsx";

// Every copy of an icon shares its mask ids, and a url(#id) resolves to the first element with that
// id. If that copy sat in a hidden subtree (a folded step, a hidden link icon), every other copy
// would draw blank, so the masks live once in an always-rendered svg instead.
const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
defs.setAttribute("aria-hidden", "true");
defs.setAttribute("width", "0");
defs.setAttribute("height", "0");
defs.style.position = "absolute";
document.body.append(defs);

function markup<P extends object>(id: string, icon: ComponentType<P>, props: P) {
  const container = document.createElement("div");
  const root = createRoot(container, { identifierPrefix: `markdown-${id}-` });
  flushSync(() => root.render(createElement(icon, props)));
  defs.append(...container.querySelectorAll("mask"));
  const html = container.innerHTML;
  root.unmount();
  return html;
}

export const RUN_ICON = markup("run", PlayIcon, {});
export const COPY_ICON = markup("copy", CopyIcon, { className: "code-copy-idle" });
export const COPIED_ICON = markup("copied", CheckIcon, { className: "code-copy-done" });
export const SITE_ICON = markup("site", GlobeIcon, {});
export const BOOK_ICON = markup("book", BookIcon, { size: 16 });

const fileIcons = new Map<FileType, string>();

export function fileIconMarkup(path: string): string {
  const type = fileTypeFor(path);
  let html = fileIcons.get(type);
  if (html === undefined) {
    html = markup(`file-${type}`, FileIcon, { path, size: 14 });
    fileIcons.set(type, html);
  }
  return html;
}
