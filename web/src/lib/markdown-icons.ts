import { createElement, type ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BookIcon } from "../components/BookIcon.tsx";
import { GlobeIcon } from "../components/GlobeIcon.tsx";
import { CopyIcon } from "../components/icons/actions.tsx";
import type { IconProps } from "../components/icons/kit.tsx";
import { CheckIcon } from "../components/icons/marks.tsx";
import { PlayIcon } from "../components/icons/media.tsx";

function markup(id: string, icon: ComponentType<IconProps>, props: IconProps = {}) {
  const container = document.createElement("div");
  const root = createRoot(container, { identifierPrefix: `markdown-${id}-` });
  flushSync(() => root.render(createElement(icon, props)));
  const html = container.innerHTML;
  root.unmount();
  return html;
}

export const RUN_ICON = markup("run", PlayIcon);
export const COPY_ICON = markup("copy", CopyIcon, { className: "code-copy-idle" });
export const COPIED_ICON = markup("copied", CheckIcon, { className: "code-copy-done" });
export const SITE_ICON = markup("site", GlobeIcon);
export const BOOK_ICON = markup("book", BookIcon, { size: 16 });
