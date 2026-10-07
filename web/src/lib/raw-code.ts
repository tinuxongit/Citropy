import { escapeHtml } from "./escape-html.ts";

export const RAW_CODE_OPEN = '<pre class="raw"><code>';
export const RAW_CODE_CLOSE = "</code></pre>";

export function rawCode(code: string): string {
  return RAW_CODE_OPEN + escapeHtml(code) + RAW_CODE_CLOSE;
}
