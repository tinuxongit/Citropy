import type { ChangedFile, FilePatch, PatchHunk } from "./protocol.ts";

const MAX_LINES = 4000;

function unquotePath(value: string): string {
  const quoted = /^"((?:\\.|[^"\\])*)"$/.exec(value);
  if (!quoted) return value;
  const input = quoted[1]!;
  const escapes: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, "\\": 92, '"': 34 };
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const match of input.matchAll(/\\([0-3][0-7]{2}|[abtnvfr\\"])/g)) {
    parts.push(encoder.encode(input.slice(from, match.index)));
    const escaped = match[1]!;
    parts.push(new Uint8Array([escapes[escaped] ?? Number.parseInt(escaped, 8)]));
    from = match.index! + match[0].length;
  }
  parts.push(encoder.encode(input.slice(from)));
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}

function headerPath(value: string, prefix: "a" | "b"): string {
  const path = value.startsWith('"')
    ? /^"(?:\\.|[^"\\])*"/.exec(value)?.[0] ?? value
    : value.split("\t")[0] ?? "";
  const decoded = unquotePath(path);
  return decoded.startsWith(`${prefix}/`) ? decoded.slice(2) : decoded;
}

function gitHeaderPath(value: string, fallback: string): string {
  const first = /^"(?:\\.|[^"\\])*" /.exec(value);
  if (first) return headerPath(value.slice(first[0].length), "b");
  const quotedDestination = value.indexOf(' "b/');
  if (quotedDestination >= 0) return headerPath(value.slice(quotedDestination + 1), "b");
  const middle = (value.length - 1) / 2;
  if (Number.isInteger(middle) && value[middle] === " " && value.startsWith("a/") &&
      value.slice(middle + 1, middle + 3) === "b/" && value.slice(2, middle) === value.slice(middle + 3))
    return value.slice(middle + 3);
  const separator = value.indexOf(" b/");
  return separator < 0 ? fallback : value.slice(separator + 3);
}

function parseDiff(text: string, fallbackPath: string, includeLines: boolean, selectedPath: string | undefined, maxLines: number): FilePatch[] {
  const patches: FilePatch[] = [];
  let current: FilePatch | null = null;
  let hunk: PatchHunk | null = null;
  let hadHunks = false;
  let budget = maxLines;
  let oldNo = 0;
  let newNo = 0;
  let oldRemaining = 0;
  let newRemaining = 0;

  const push = () => {
    if (current && (selectedPath === undefined || current.path === selectedPath)) patches.push(current);
    current = null;
    hunk = null;
    hadHunks = false;
    budget = maxLines;
  };
  const collect = () => includeLines && (selectedPath === undefined || current?.path === selectedPath);

  let offset = 0;
  while (offset <= text.length) {
    const end = text.indexOf("\n", offset);
    const line = text.slice(offset, end < 0 ? text.length : end);
    offset = end < 0 ? text.length + 1 : end + 1;
    if (line.startsWith("diff --git ")) {
      push();
      current = { path: gitHeaderPath(line.slice(11), fallbackPath), added: 0, removed: 0, hunks: [] };
      continue;
    }
    if (!hunk && line.startsWith("+++ ")) {
      const path = headerPath(line.slice(4), "b");
      if (!current) current = { path, added: 0, removed: 0, hunks: [] };
      else if (path && path !== "/dev/null") current.path = path;
      continue;
    }
    if (!hunk && line.startsWith("--- ")) {
      if (hadHunks) push();
      if (!current) current = { path: fallbackPath, added: 0, removed: 0, hunks: [] };
      const path = headerPath(line.slice(4), "a");
      if (path && path !== "/dev/null") current.path = path;
      continue;
    }
    if (!hunk && current && (line.startsWith("rename to ") || line.startsWith("copy to "))) {
      current.path = unquotePath(line.slice(line.startsWith("rename to ") ? 10 : 8));
      continue;
    }
    if (line.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (!match) continue;
      if (!current) current = { path: fallbackPath, added: 0, removed: 0, hunks: [] };
      oldNo = Number(match[1]);
      newNo = Number(match[3]);
      oldRemaining = Number(match[2] ?? 1);
      newRemaining = Number(match[4] ?? 1);
      hunk = { header: (match[5] ?? "").trim(), oldStart: oldNo, newStart: newNo, lines: [] };
      if (oldRemaining || newRemaining) {
        hadHunks = true;
        if (collect()) {
          if (budget > 0) current.hunks.push(hunk);
          else current.truncated = true;
        }
      } else hunk = null;
      continue;
    }
    if (!current || !hunk) continue;
    const storeLine = collect() && budget > 0;
    let recognized = true;
    if (line.startsWith("+")) {
      if (storeLine) hunk.lines.push({ type: "add", text: line.slice(1), newNo });
      newNo += 1;
      current.added += 1;
      newRemaining -= 1;
    } else if (line.startsWith("-")) {
      if (storeLine) hunk.lines.push({ type: "del", text: line.slice(1), oldNo });
      oldNo += 1;
      current.removed += 1;
      oldRemaining -= 1;
    } else if (line.startsWith(" ")) {
      if (storeLine) hunk.lines.push({ type: "ctx", text: line.slice(1), oldNo, newNo });
      oldNo += 1;
      newNo += 1;
      oldRemaining -= 1;
      newRemaining -= 1;
    } else recognized = false;
    if (recognized) {
      budget -= 1;
      if (budget < 0 && collect()) current.truncated = true;
    }
    if (oldRemaining <= 0 && newRemaining <= 0) hunk = null;
  }
  push();
  return patches;
}

export function parseUnifiedDiff(text: string, fallbackPath = "", selectedPath?: string, maxLines = MAX_LINES): FilePatch[] {
  return parseDiff(text, fallbackPath, true, selectedPath, maxLines);
}

export function summarizeUnifiedDiff(text: string): ChangedFile[] {
  return parseDiff(text, "", false, undefined, 0).map(({ path, added, removed }) => ({ path, added, removed }));
}
