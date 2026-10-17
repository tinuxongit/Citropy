import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { serversInConfig } from "../../shared/mcp-paste.ts";
import type { McpServerDraft } from "../../shared/features.ts";
import type { ProviderId } from "../../shared/protocol.ts";
import { claudeHome, codexHome } from "../providers/config-folders.ts";
import { writeLog } from "../logs.ts";

export interface FoundServer extends McpServerDraft {
  providers: ProviderId[];
}

async function text(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// OpenCode allows comments and trailing commas in its config.
function looseJson(source: string): unknown {
  return JSON.parse(
    source
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, string) => string ?? "")
      .replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (_, string, close) => string ?? close),
  );
}

/**
 * Reads the TOML that Codex's config.toml uses for servers: tables, dotted keys, strings,
 * arrays and inline tables. Other values are kept as raw text.
 */
export function readToml(source: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let table: Record<string, unknown> | undefined = root;
  let index = 0;
  const skip = () => {
    while (index < source.length) {
      if (/\s/.test(source[index]!)) index++;
      else if (source[index] === "#")
        while (index < source.length && source[index] !== "\n") index++;
      else break;
    }
  };
  const key = (): string[] => {
    const parts: string[] = [];
    for (;;) {
      skip();
      const quote = source[index];
      if (quote === '"' || quote === "'") parts.push(string());
      else {
        const match = /^[A-Za-z0-9_-]+/.exec(source.slice(index));
        if (!match) throw new Error(`Unexpected text at ${index}`);
        parts.push(match[0]);
        index += match[0].length;
      }
      skip();
      if (source[index] !== ".") return parts;
      index++;
    }
  };
  const string = (): string => {
    const quote = source[index]!;
    const end = source.indexOf(quote, index + 1);
    if (quote === "'") {
      const value = source.slice(index + 1, end);
      index = end + 1;
      return value;
    }
    const match = /^"(?:\\.|[^"\\])*"/.exec(source.slice(index));
    if (!match) throw new Error(`Unclosed string at ${index}`);
    index += match[0].length;
    return JSON.parse(match[0]);
  };
  const value = (): unknown => {
    skip();
    const start = source[index];
    if (start === '"' || start === "'") return string();
    if (start === "[") {
      index++;
      const items: unknown[] = [];
      for (skip(); source[index] !== "]"; skip()) {
        items.push(value());
        skip();
        if (source[index] === ",") index++;
      }
      index++;
      return items;
    }
    if (start === "{") {
      index++;
      const entries: Record<string, unknown> = {};
      for (skip(); source[index] !== "}"; skip()) {
        assign(entries, key(), (index++, value()));
        skip();
        if (source[index] === ",") index++;
      }
      index++;
      return entries;
    }
    const match = /^[^\s,\]}#]+/.exec(source.slice(index))!;
    index += match[0].length;
    return match[0] === "true" ? true : match[0] === "false" ? false : match[0];
  };
  const assign = (target: Record<string, unknown>, path: string[], entry: unknown) => {
    const last = path.at(-1)!;
    for (const part of path.slice(0, -1)) target = (target[part] ??= {}) as Record<string, unknown>;
    target[last] = entry;
  };
  for (skip(); index < source.length; skip()) {
    if (source[index] === "[") {
      const many = source[index + 1] === "[";
      index += many ? 2 : 1;
      const path = key();
      index += many ? 2 : 1;
      // Arrays of tables don't hold servers, so their keys are read and dropped.
      table = many ? {} : root;
      if (!many) for (const part of path) table = (table[part] ??= {}) as Record<string, unknown>;
      continue;
    }
    const path = key();
    if (source[index] !== "=") throw new Error(`Expected = at ${index}`);
    index++;
    assign(table, path, value());
  }
  return root;
}

function codexServers(config: Record<string, unknown>): McpServerDraft[] {
  const servers = config.mcp_servers;
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers as Record<string, Record<string, unknown>>).flatMap(
    ([name, entry]) => {
      if (!entry || typeof entry !== "object" || entry.enabled === false) return [];
      const token =
        typeof entry.bearer_token_env_var === "string"
          ? process.env[entry.bearer_token_env_var]
          : undefined;
      return serversInConfig({
        [name]: {
          ...entry,
          headers: {
            ...(entry.http_headers as object),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      });
    },
  );
}

/** Two entries with the same address are the same server, whatever each app calls it. */
export function serverKey(server: McpServerDraft): string {
  return server.url ?? JSON.stringify([server.command, ...(server.args ?? [])]);
}

/** Servers that Claude Code, Codex and OpenCode load from their own settings. */
export async function foundServers(): Promise<FoundServer[]> {
  const claudeConfig = process.env.CLAUDE_CONFIG_DIR
    ? join(claudeHome(), ".claude.json")
    : join(homedir(), ".claude.json");
  const openCodeFolder = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "opencode",
  );
  const sources: Array<[ProviderId, () => Promise<McpServerDraft[]>]> = [
    [
      "claude",
      async () => {
        const source = await text(claudeConfig);
        const config = source ? (JSON.parse(source) as { mcpServers?: unknown }) : undefined;
        return config?.mcpServers ? serversInConfig({ mcpServers: config.mcpServers }) : [];
      },
    ],
    [
      "codex",
      async () => {
        const source = await text(join(codexHome(), "config.toml"));
        return source ? codexServers(readToml(source)) : [];
      },
    ],
    [
      "opencode",
      async () => {
        const source =
          (await text(join(openCodeFolder, "opencode.json"))) ??
          (await text(join(openCodeFolder, "opencode.jsonc")));
        const config = source ? (looseJson(source) as { mcp?: unknown }) : undefined;
        return config?.mcp ? serversInConfig({ mcp: config.mcp }) : [];
      },
    ],
  ];
  const found = new Map<string, FoundServer>();
  for (const [provider, read] of sources) {
    let servers: McpServerDraft[];
    try {
      servers = await read();
    } catch (error) {
      writeLog(
        "warn",
        "mcp",
        `Could not read ${provider} MCP servers: ${(error as Error).message}`,
      );
      continue;
    }
    for (const server of servers) {
      if (server.name === "citropy") continue;
      const known = found.get(serverKey(server));
      if (known) {
        if (!known.providers.includes(provider)) known.providers.push(provider);
      } else found.set(serverKey(server), { ...server, providers: [provider] });
    }
  }
  return [...found.values()];
}
