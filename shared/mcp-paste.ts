import type { McpServerDraft } from "./features.ts";

export type McpPaste = { servers: McpServerDraft[] } | { error: string };

const SUFFIXES = /^(mcp-server-|server-|mcp-)|(-mcp-server|-mcp|-server)$/g;
// A pasted line only counts as a command when it starts with a runner or a path, so a sentence
// isn't mistaken for one.
const RUNNER =
  /^(npx|bunx|pnpm|yarn|uvx|uv|node|bun|deno|python3?|docker|podman|go|java|dotnet)$|[/\\]/;
const OPTIONS_WITH_VALUES = new Set(["-t", "--transport", "-s", "--scope"]);

// Splits a shell line on spaces and keeps quoted parts together.
function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3]!,
  );
}

function titled(raw: string): string {
  const words = raw.split(/[-_. ]+/).filter(Boolean);
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ") || raw;
}

function nameFromUrl(url: URL): string {
  const labels = url.hostname.split(".").filter((label) => !["mcp", "www", "api"].includes(label));
  return titled(labels.length > 1 ? labels.at(-2)! : (labels[0] ?? url.hostname));
}

// "@modelcontextprotocol/server-filesystem" is Filesystem, "@playwright/mcp@latest" is Playwright.
function nameFromPackage(spec: string): string {
  const parts = spec
    .replace(/(.)@[^/@]*$/, "$1")
    .split("/")
    .filter(Boolean);
  const last = (parts.at(-1) ?? spec).replace(/\.(m?js|ts|py)$/, "");
  const name = last.replace(SUFFIXES, "");
  return titled(
    name && name !== "mcp" && name !== "server" ? name : (parts.at(-2) ?? last).replace(/^@/, ""),
  );
}

function remote(text: string): URL | undefined {
  if (!/^https?:\/\//i.test(text)) return undefined;
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

function fromCommand([command, ...args]: string[], name?: string): McpServerDraft | undefined {
  if (!command) return undefined;
  const url = remote(command);
  if (url) return { name: name ?? nameFromUrl(url), url: url.href };
  const target = args.find(
    (arg) => !arg.startsWith("-") && !["run", "exec", "dlx", "x"].includes(arg),
  );
  return { name: name ?? nameFromPackage(target ?? command), command, args };
}

// The commands READMEs give for Claude Code and Codex, like `claude mcp add linear https://…`.
function fromAddCommand(parts: string[]): McpServerDraft | undefined {
  const env: Record<string, string> = {};
  const headers: Record<string, string> = {};
  const rest: string[] = [];
  let name: string | undefined;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (part === "--") {
      rest.push(...parts.slice(index + 1));
      break;
    }
    if (part === "-e" || part === "--env") {
      const [key, ...value] = (parts[++index] ?? "").split("=");
      if (key) env[key] = value.join("=");
    } else if (part === "-H" || part === "--header") {
      const [key, ...value] = (parts[++index] ?? "").split(":");
      if (key) headers[key.trim()] = value.join(":").trim();
    } else if (OPTIONS_WITH_VALUES.has(part)) index++;
    else if (!part.startsWith("-")) {
      if (name) rest.push(part);
      else name = part;
    }
  }
  const server = fromCommand(rest, name);
  if (!server) return undefined;
  return {
    ...server,
    ...(Object.keys(env).length ? { env } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

function record(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// Reads the entry formats Claude Code, Cursor, VS Code, Windsurf, Gemini and OpenCode use.
function fromConfig(config: unknown, name?: string): McpServerDraft | undefined {
  if (!config || typeof config !== "object") return undefined;
  const entry = config as Record<string, unknown>;
  const address = [entry.url, entry.serverUrl, entry.httpUrl].find(
    (value) => typeof value === "string",
  );
  const url = typeof address === "string" ? remote(address) : undefined;
  const headers = record(entry.headers);
  if (url)
    return { name: name ?? nameFromUrl(url), url: url.href, ...(headers ? { headers } : {}) };
  const command = Array.isArray(entry.command)
    ? entry.command
    : [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])];
  if (!command.every((part) => typeof part === "string")) return undefined;
  const server = fromCommand(command as string[], name);
  const env = record(entry.env ?? entry.environment);
  return server && !server.url ? { ...server, ...(env ? { env } : {}) } : undefined;
}

/** The servers in a JSON config, whichever app wrote it. */
export function serversInConfig(value: unknown): McpServerDraft[] {
  if (!value || typeof value !== "object") return [];
  const root = value as Record<string, unknown>;
  const single = fromConfig(root);
  if (single) return [single];
  const list = (root.mcpServers ??
    root.servers ??
    root.mcp ??
    (root.mcp_servers as unknown) ??
    root) as Record<string, unknown>;
  if (!list || typeof list !== "object") return [];
  return Object.entries(list).flatMap(([name, config]) => {
    const server = fromConfig(config, name);
    return server ? [server] : [];
  });
}

export function readMcpPaste(text: string): McpPaste | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  let servers: McpServerDraft[] = [];
  if (/^[{[]/.test(trimmed)) {
    try {
      servers = serversInConfig(JSON.parse(trimmed));
    } catch {
      return { error: "That looks like JSON, but it doesn't parse. Copy the whole block." };
    }
  } else {
    const line = words(trimmed.replace(/\\\r?\n/g, " "));
    const add = line.findIndex((word, index) => word === "add" && line[index - 1] === "mcp");
    const server =
      add >= 0
        ? fromAddCommand(line.slice(add + 1))
        : remote(line[0]!) || RUNNER.test(line[0]!)
          ? fromCommand(line)
          : undefined;
    if (server) servers = [server];
  }
  return servers.length
    ? { servers }
    : { error: "Paste a link that starts with https://, a command like npx …, or a JSON config." };
}
