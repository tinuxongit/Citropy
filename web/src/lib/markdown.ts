import { Marked, type Token, type Tokens } from "marked";
import { escapeHtml } from "./escape-html.ts";
import { highlight } from "./highlight.ts";
import { rawCode } from "./raw-code.ts";
import { serverUrl } from "./environment.ts";
import { faviconUrl } from "./favicon.ts";
import { BOOK_ICON, COPIED_ICON, COPY_ICON, RUN_ICON, SITE_ICON } from "./markdown-icons.ts";
import type { MentionTag } from "../../../shared/mention-tags.ts";

interface CodeToken extends Tokens.Code {
  rendered?: string;
}

const SHELL_LANGUAGES = ["sh", "bash", "zsh", "fish", "shell", "powershell", "pwsh"];

interface MentionToken extends Tokens.Generic {
  tag: MentionTag;
}

function siteIcon(origin: string): string {
  const favicon = escapeHtml(faviconUrl(origin));
  return `<span class="link-site-icon" aria-hidden="true">${SITE_ICON}<img class="link-favicon" src="${favicon}" width="16" height="16" alt="" decoding="async" referrerpolicy="no-referrer"/></span>`;
}

function mentionIcon(tag: MentionTag): string {
  if (tag.icon === "site") return siteIcon(new URL(tag.url!).origin);
  return tag.icon === "citropy" ? '<span class="citropy-mark" aria-hidden="true"></span>' : BOOK_ICON;
}

interface AssetContext {
  projectId: string;
  threadId: string;
}

function closedFence(raw: string): boolean {
  return /(^|\n) {0,3}(`{3,}|~{3,})\s*$/.test(raw.trimEnd());
}

function runnable(code: Tokens.Code, label: string): boolean {
  const command = code.text.trim();
  return SHELL_LANGUAGES.includes(label) && closedFence(code.raw) && Boolean(command) && !command.endsWith("\\") && !/[\p{Cc}\p{Cf}]/u.test(command.replace(/[\n\t]/g, ""));
}

function createParser(theme: "dark" | "light", signal: AbortSignal | undefined, assets: AssetContext | undefined, images: boolean, live: boolean, commands: boolean, mentions: MentionTag[] = []) {
  let linkedImage = false;
  const tags = new Map(mentions.map((tag) => [tag.name, tag]));
  const marked = new Marked({
    gfm: true,
    breaks: false,
    async: true,
  });

  marked.use({
    async: true,
    extensions: [{
      name: "singleTilde",
      level: "inline",
      start: (source) => /~(?!~)/.exec(source)?.index,
      tokenizer: (source) => source.startsWith("~") && !source.startsWith("~~") ? { type: "text", raw: "~", text: "~" } : undefined,
    }, {
      name: "mention",
      level: "inline",
      start: (source) => {
        const match = tags.size ? /(?:^|\s)@/.exec(source) : null;
        return match ? match.index + match[0].length - 1 : undefined;
      },
      tokenizer: (source, tokens) => {
        const before = tokens.at(-1)?.raw;
        const match = /^@([\w.:-]+)(?![\w./:-])/.exec(source);
        const tag = match && (!before || /\s$/.test(before)) ? tags.get(match[1]!) : undefined;
        return tag ? { type: "mention", raw: match![0], tag } : undefined;
      },
      renderer: (token) => {
        const { tag } = token as MentionToken;
        return `<span class="mention-chip">${mentionIcon(tag)}${escapeHtml(tag.title)}</span>`;
      },
    }],
    walkTokens: async (token) => {
      if (token.type !== "code" || signal?.aborted) return;
      const code = token as CodeToken;
      if (live && !closedFence(code.raw)) return;
      code.rendered = await highlight(code.text, code.lang, theme, signal);
    },
    renderer: {
      code(token) {
        const code = token as CodeToken;
        const label = (code.lang ?? "").split(/\s+/)[0] ?? "";
        const body = code.rendered ?? rawCode(code.text);
        const copy = escapeHtml("Copy code");
        const runLabel = escapeHtml("Run in terminal");
        const run = commands && runnable(code, label) ? `<button type="button" class="code-run" aria-label="${runLabel}" title="${runLabel}">${RUN_ICON}</button>` : "";
        return `<figure class="code-block" data-lang="${escapeHtml(label)}"><figcaption><span>${escapeHtml(label || "text")}</span>${run}<button type="button" class="code-copy" aria-label="${copy}" title="${copy}">${COPY_ICON}${COPIED_ICON}</button></figcaption>${body}</figure>`;
      },
      html(token) {
        return escapeHtml((token as Tokens.HTML).raw);
      },
      paragraph(token) {
        const inline = (token as Tokens.Paragraph).tokens;
        if (!images || !inline.some((part) => part.type === "image")) return false;
        const runs: { images: boolean; tokens: Token[] }[] = [];
        for (const part of inline) {
          const last = runs.at(-1);
          const image = part.type === "image";
          if (last && (last.images === image || !part.raw.trim())) last.tokens.push(part);
          else runs.push({ images: image, tokens: [part] });
        }
        return runs.map((run) => `<p${run.images ? ' class="markdown-images"' : ""}>${this.parser.parseInline(run.tokens)}</p>\n`).join("");
      },
      image(token) {
        const image = token as Tokens.Image;
        if (!images) return escapeHtml(image.text || image.href || "");
        let src = image.href ?? "";
        const alt = escapeHtml(image.text ?? "");
        const title = image.title ? ` title="${escapeHtml(image.title)}"` : "";
        const visual = /^citropy-visual:([0-9a-f-]{36})$/.exec(src);
        if (visual && assets) {
          const page = serverUrl(`/api/visual-pages?${new URLSearchParams({ threadId: assets.threadId, id: visual[1]! })}`);
          return `<iframe class="markdown-visual" src="${escapeHtml(page)}" title="${alt}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>`;
        }
        const stored = /^citropy-image:([0-9a-f-]{36})$/.exec(src);
        if (stored && assets) {
          src = serverUrl(`/api/tool-images?${new URLSearchParams({ threadId: assets.threadId, id: stored[1]! })}`);
        } else if (assets && !/^(https?:|data:|blob:|\/\/)/i.test(src)) {
          src = serverUrl(`/api/assets?${new URLSearchParams({ projectId: assets.projectId, threadId: assets.threadId, path: src.replace(/^file:\/\//, "") })}`);
        }
        const tag = linkedImage ? "span" : "button";
        const preview = escapeHtml("Preview");
        const unavailable = escapeHtml("Image unavailable");
        const attributes = linkedImage ? "" : ` type="button" aria-label="${preview}${alt ? ` ${alt}` : ""}"`;
        return `<${tag} class="markdown-image"${attributes}><img src="${escapeHtml(src)}" alt="${alt}"${title} loading="lazy" decoding="async" /><span class="markdown-image-error" hidden>${unavailable}</span></${tag}>`;
      },
      link(token) {
        const link = token as Tokens.Link;
        const href = escapeHtml(link.href ?? "");
        if (!/^(https?:|mailto:)/i.test(href)) return this.parser.parseInline(link.tokens);
        let icon = "";
        try {
          const url = new URL(link.href);
          if (images && ["http:", "https:"].includes(url.protocol)) icon = siteIcon(url.origin);
        } catch {}
        const previous = linkedImage;
        linkedImage = true;
        const body = this.parser.parseInline(link.tokens);
        linkedImage = previous;
        return `<a href="${href}" target="_blank" rel="noreferrer noopener">${icon}${body}</a>`;
      },
    },
  });

  return marked;
}

export interface FinishedBlocks {
  source: string;
  html: string[];
}

export async function renderStreamingMarkdown(text: string, mode: "dark" | "light", signal: AbortSignal | undefined, assets: AssetContext | undefined, { images = true }: { images?: boolean }, previous: FinishedBlocks): Promise<{ finished: FinishedBlocks; blocks: string[] }> {
  const base = text.startsWith(previous.source) ? previous : { source: "", html: [] };
  const marked = createParser(mode, signal, assets, images, true, false);
  const rest = text.slice(base.source.length);
  const tokens = marked.lexer(rest);
  await Promise.all(marked.walkTokens(tokens, marked.defaults.walkTokens!));
  let open = tokens.length - 1;
  while (open >= 0 && tokens[open]!.type === "space") open--;
  const html = [...base.html];
  let consumed = 0;
  let done = 0;
  for (const token of tokens.slice(0, Math.max(0, open))) {
    if (!rest.startsWith(token.raw, consumed)) break;
    consumed += token.raw.length;
    html.push(marked.parser([token]) as string);
    done++;
  }
  return {
    finished: { source: base.source + rest.slice(0, consumed), html },
    blocks: [...html, marked.parser(tokens.slice(done)) as string],
  };
}

export async function renderMarkdown(text: string, mode: "dark" | "light", signal?: AbortSignal, assets?: AssetContext, { images = true, live = false, commands = false, mentions = [] }: { images?: boolean; live?: boolean; commands?: boolean; mentions?: MentionTag[] } = {}): Promise<string> {
  if (/^\s*\d+[.)]\s*$/.test(text)) return `<p>${escapeHtml(text.trim())}</p>`;
  return (await createParser(mode, signal, assets, images, live, commands, mentions).parse(text)) as string;
}
