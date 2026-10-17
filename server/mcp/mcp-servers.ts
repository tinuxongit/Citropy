import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError, auth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import packageInfo from "../../package.json" with { type: "json" };
import type {
  McpOverview,
  McpServer,
  McpServerDraft,
  McpToolAccess,
} from "../../shared/features.ts";
import { uid } from "../ids.ts";
import { writeLog } from "../logs.ts";
import { dataRoot } from "../paths.ts";
import { ask } from "../permissions.ts";
import { refreshToolsWhenCold } from "../runtime.ts";
import { store } from "../store.ts";
import { foundServers, serverKey } from "./mcp-found.ts";
import { McpSignIn, returningSignIn, type SavedSignIn } from "./mcp-sign-in.ts";

const SETTINGS = {
  connectTimeoutMs: 2 * 60_000,
  // Agents ask for tools when a session starts; servers that are still starting get this long.
  startWaitMs: 15_000,
  callTimeoutMs: 10 * 60_000,
  stderrTail: 4000,
};

interface SavedServer extends McpServerDraft {
  id: string;
  key: string;
  enabled: boolean;
  access: Record<string, McpToolAccess>;
  oauth?: SavedSignIn;
}

interface Live {
  status: McpServer["status"];
  error?: string;
  signInUrl?: string;
  client?: Client;
  tools: Tool[];
  instructions?: string;
  starting?: Promise<void>;
}

const file = join(dataRoot, "mcp-servers.json");
const saved: SavedServer[] = existsSync(file)
  ? ((JSON.parse(readFileSync(file, "utf8")) as { servers?: SavedServer[] }).servers ?? [])
  : [];
const live = new Map<string, Live>();
const signIns = new Map<string, McpSignIn>();
let shownTools = "[]";

function save(): void {
  writeFileSync(file, JSON.stringify({ servers: saved }, null, 2), { mode: 0o600 });
}

function findServer(id: unknown): SavedServer {
  const server = saved.find((entry) => entry.id === id);
  if (!server) throw new Error("Server not found");
  return server;
}

// Claude Code refuses tool names over 64 characters, and "mcp__citropy__" takes 14 of them.
function hubName(server: SavedServer, tool: string): string {
  const name = `${server.key}__${tool.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (name.length <= 50) return name;
  return `${name.slice(0, 43)}_${createHash("sha256").update(tool).digest("hex").slice(0, 6)}`;
}

function access(server: SavedServer, tool: Tool): McpToolAccess {
  return server.access[tool.name] ?? (tool.annotations?.readOnlyHint ? "allow" : "ask");
}

function visibleTools(): Array<{ server: SavedServer; tool: Tool; name: string }> {
  return saved.flatMap((server) =>
    server.enabled && live.get(server.id)?.status === "connected"
      ? live
          .get(server.id)!
          .tools.filter((tool) => access(server, tool) !== "off")
          .map((tool) => ({ server, tool, name: hubName(server, tool.name) }))
      : [],
  );
}

// Providers read tool lists when a session starts, so sessions restart to see changes.
function toolsMayHaveChanged(): void {
  const shown = JSON.stringify(
    visibleTools().map(({ name, server }) => [name, live.get(server.id)?.instructions]),
  );
  if (shown === shownTools) return;
  shownTools = shown;
  refreshToolsWhenCold();
}

function signInFor(server: SavedServer, entry: Live): McpSignIn {
  let signIn = signIns.get(server.id);
  if (!signIn) {
    signIn = new McpSignIn(
      server.id,
      () => saved.find((candidate) => candidate.id === server.id)?.oauth,
      (oauth) => {
        const current = saved.find((candidate) => candidate.id === server.id);
        if (!current) return;
        current.oauth = oauth;
        save();
      },
      (url) => {
        const current = live.get(server.id);
        if (current) current.signInUrl = url;
      },
    );
    signIns.set(server.id, signIn);
  }
  entry.signInUrl = undefined;
  return signIn;
}

async function connect(server: SavedServer, entry: Live): Promise<Client> {
  const client = new Client(
    { name: "citropy", version: packageInfo.version },
    {
      listChanged: {
        tools: {
          onChanged: (error, tools) => {
            if (error) writeLog("warn", "mcp", `${server.name} tool list failed: ${error.message}`);
            else if (tools && entry.client === client) {
              entry.tools = tools;
              toolsMayHaveChanged();
            }
          },
        },
      },
    },
  );
  const options = { timeout: SETTINGS.connectTimeoutMs };
  if (server.command) {
    let stderr = "";
    // One shared process serves every project, so it starts in the home folder.
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      env: { ...(process.env as Record<string, string>), ...server.env },
      cwd: homedir(),
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-SETTINGS.stderrTail);
    });
    client.onclose = () => {
      if (entry.client !== client) return;
      entry.client = undefined;
      entry.status = "failed";
      entry.error = ["The server stopped.", stderr.trim()].filter(Boolean).join("\n\n");
      toolsMayHaveChanged();
    };
    try {
      await client.connect(transport, options);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new Error(
        [
          code === "ENOENT"
            ? `Couldn't find ${server.command} on this computer.`
            : (error as Error).message,
          stderr.trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    return client;
  }
  const url = new URL(server.url!);
  const transportOptions = {
    authProvider: signInFor(server, entry),
    requestInit: { headers: server.headers ?? {} },
  };
  const order = url.pathname.endsWith("/sse") ? ["sse", "http"] : ["http", "sse"];
  let failure: unknown;
  for (const kind of order) {
    try {
      await client.connect(
        kind === "sse"
          ? new SSEClientTransport(url, transportOptions)
          : new StreamableHTTPClientTransport(url, transportOptions),
        options,
      );
      client.onclose = () => {
        if (entry.client !== client) return;
        entry.client = undefined;
        entry.status = "failed";
        entry.error = "The connection closed.";
        toolsMayHaveChanged();
      };
      return client;
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      failure ??= error;
    }
  }
  throw failure;
}

async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

function start(server: SavedServer): Promise<void> {
  const entry: Live = { status: "starting", tools: [] };
  live.set(server.id, entry);
  const starting = (async () => {
    let client: Client | undefined;
    try {
      client = await connect(server, entry);
      if (live.get(server.id) !== entry) {
        await client.close();
        return;
      }
      entry.client = client;
      entry.instructions = client.getInstructions();
      entry.tools = await listAllTools(client);
      entry.status = "connected";
    } catch (error) {
      if (live.get(server.id) !== entry) return;
      entry.client = undefined;
      await client
        ?.close()
        .catch((closeError: Error) =>
          writeLog("warn", "mcp", `${server.name} didn't close: ${closeError.message}`),
        );
      if (error instanceof UnauthorizedError || entry.signInUrl) {
        entry.status = "signin";
      } else {
        entry.status = "failed";
        entry.error = (error as Error).message;
        writeLog("warn", "mcp", `${server.name} didn't start: ${entry.error}`);
      }
    } finally {
      entry.starting = undefined;
      toolsMayHaveChanged();
    }
  })();
  entry.starting = starting;
  return starting;
}

async function stop(id: string): Promise<void> {
  const entry = live.get(id);
  live.delete(id);
  const client = entry?.client;
  if (entry) entry.client = undefined;
  await client?.close();
}

async function restart(server: SavedServer): Promise<void> {
  await stop(server.id);
  if (server.enabled) void start(server);
}

async function ready(): Promise<void> {
  const starting = [...live.values()].flatMap((entry) => entry.starting ?? []);
  if (!starting.length) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled(starting),
    new Promise((resolve) => (timer = setTimeout(resolve, SETTINGS.startWaitMs))),
  ]);
  clearTimeout(timer);
}

export async function hubTools(): Promise<Tool[]> {
  await ready();
  return visibleTools().map(({ server, tool, name }) => ({
    ...tool,
    name,
    description: `${server.name}: ${tool.description ?? tool.title ?? tool.name}`,
  }));
}

export async function hubInstructions(): Promise<string> {
  await ready();
  const notes = saved.flatMap((server) => {
    const instructions = live.get(server.id)?.instructions?.trim();
    return server.enabled && live.get(server.id)?.status === "connected" && instructions
      ? [`## ${server.name} (tools named ${server.key}__*)\n${instructions}`]
      : [];
  });
  return notes.length ? `\n\n# Connected MCP servers\n\n${notes.join("\n\n")}` : "";
}

/** Calls a tool from a connected server, or returns undefined when the name isn't one. */
export async function callHubTool(
  threadId: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<CallToolResult | undefined> {
  const match = visibleTools().find((entry) => entry.name === name);
  if (!match) {
    if (saved.some((server) => name.startsWith(`${server.key}__`)))
      throw new Error("This tool is turned off or its server isn't connected.");
    return undefined;
  }
  const { server, tool } = match;
  const thread = store.threads.get(threadId);
  if (!thread) throw new Error("Conversation closed");
  if (access(server, tool) === "ask" && thread.permissionMode !== "bypass") {
    if (thread.permissionMode === "plan")
      throw new Error("This action is unavailable in Plan only mode.");
    const decision = await ask(threadId, `mcp__citropy__${name}`, args, { signal });
    if (decision === "deny") throw new Error("Denied by the operator");
    if (!store.threads.has(threadId)) throw new Error("Conversation closed");
  }
  const client = live.get(server.id)?.client;
  if (!client) throw new Error(`${server.name} isn't connected.`);
  return (await client.callTool({ name: tool.name, arguments: args }, undefined, {
    signal,
    timeout: SETTINGS.callTimeoutMs,
    resetTimeoutOnProgress: true,
  })) as CallToolResult;
}

function publicServer(server: SavedServer): McpServer {
  const entry = live.get(server.id);
  return {
    id: server.id,
    name: server.name,
    ...(server.url ? { url: server.url } : { command: server.command, args: server.args ?? [] }),
    enabled: server.enabled,
    status: entry?.status ?? "failed",
    ...(entry?.error ? { error: entry.error } : {}),
    ...(entry?.status === "signin" && entry.signInUrl ? { signInUrl: entry.signInUrl } : {}),
    tools: (entry?.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? tool.title ?? "",
      access: access(server, tool),
    })),
  };
}

async function overview(): Promise<McpOverview> {
  const added = new Set(saved.map(serverKey));
  return {
    servers: saved.map(publicServer),
    // Environment values and headers stay here: they often hold keys.
    found: (await foundServers())
      .filter((server) => !added.has(serverKey(server)))
      .map(({ name, url, command, args, providers }) =>
        url ? { name, url, providers } : { name, command, args: args ?? [], providers },
      ),
  };
}

function strings(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error(`Too many ${label.toLowerCase()} values`);
  for (const [key, entry] of entries)
    if (typeof entry !== "string" || !key || key.length > 200 || entry.length > 10_000)
      throw new Error(`${label} values must be text`);
  return value as Record<string, string>;
}

function draft(value: unknown): McpServerDraft {
  if (!value || typeof value !== "object") throw new Error("Invalid server");
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) throw new Error("Server names need 1 to 80 characters");
  if ((input.url === undefined) === (input.command === undefined))
    throw new Error(`${name} needs either an address or a command`);
  if (input.url !== undefined) {
    let url: URL;
    try {
      url = new URL(String(input.url));
    } catch {
      throw new Error(`${name} has an invalid address`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error(`${name} needs an http or https address`);
    return { name, url: url.href, headers: strings(input.headers, "Headers") };
  }
  const args = input.args ?? [];
  if (
    typeof input.command !== "string" ||
    !input.command.trim() ||
    input.command.length > 1000 ||
    !Array.isArray(args) ||
    args.length > 100 ||
    args.some((arg) => typeof arg !== "string" || arg.length > 4000)
  )
    throw new Error(`${name} has an invalid command`);
  return {
    name,
    command: input.command.trim(),
    args: args as string[],
    env: strings(input.env, "Environment"),
  };
}

function addServers(drafts: McpServerDraft[]): void {
  const keys = new Set(saved.map(serverKey));
  const fresh = drafts.filter((server) => {
    const key = serverKey(server);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  if (!fresh.length)
    throw new Error(
      drafts.length === 1 ? "That server is already added" : "Those servers are already added",
    );
  for (const server of fresh) {
    const base =
      server.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20)
        .replace(/-$/, "") || "server";
    let key = base;
    for (let n = 2; saved.some((entry) => entry.key === key); n++) key = `${base}-${n}`;
    const entry: SavedServer = {
      id: uid("mcp"),
      key,
      enabled: true,
      access: {},
      name: server.name,
      ...(server.url
        ? { url: server.url, ...(server.headers ? { headers: server.headers } : {}) }
        : {
            command: server.command,
            args: server.args ?? [],
            ...(server.env ? { env: server.env } : {}),
          }),
    };
    saved.push(entry);
    void start(entry);
  }
  save();
}

/** Settings API under /api/mcp. */
export async function handleMcpSettings(
  method: string,
  operation: string,
  input: Record<string, unknown>,
): Promise<McpOverview> {
  if (method === "GET" && operation === "") return overview();
  if (method === "POST" && operation === "") {
    if (input.found === true) {
      const added = new Set(saved.map(serverKey));
      addServers((await foundServers()).filter((server) => !added.has(serverKey(server))));
    } else {
      if (!Array.isArray(input.servers) || !input.servers.length || input.servers.length > 50)
        throw new Error("Add 1 to 50 servers at a time");
      addServers(input.servers.map(draft));
    }
  } else if (method === "DELETE" && operation === "") {
    const server = findServer(input.id);
    saved.splice(saved.indexOf(server), 1);
    signIns.get(server.id)?.forget();
    signIns.delete(server.id);
    save();
    await stop(server.id);
    toolsMayHaveChanged();
  } else if (method === "PATCH" && operation === "server") {
    const server = findServer(input.id);
    if (typeof input.enabled !== "boolean") throw new Error("enabled must be true or false");
    server.enabled = input.enabled;
    save();
    await restart(server);
    toolsMayHaveChanged();
  } else if (method === "PATCH" && operation === "tool") {
    const server = findServer(input.id);
    if (typeof input.tool !== "string" || !input.tool) throw new Error("Tool not found");
    if (input.access !== "ask" && input.access !== "allow" && input.access !== "off")
      throw new Error("Access must be ask, allow or off");
    server.access[input.tool] = input.access;
    save();
    toolsMayHaveChanged();
  } else if (method === "POST" && operation === "restart") {
    await restart(findServer(input.id));
  } else throw new Error("Unknown MCP action");
  return overview();
}

const html = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function page(res: ServerResponse, status: number, title: string, detail: string): void {
  res
    .writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    })
    .end(
      `<!doctype html><meta charset="utf-8"><title>${html(title)}</title>` +
        `<body style="font:16px system-ui;max-width:32rem;margin:20vh auto;padding:0 1rem;color-scheme:light dark">` +
        `<h1 style="font-size:1.4rem">${html(title)}</h1><p>${html(detail)}</p>`,
    );
}

/** Where a server's sign-in page sends the browser back. */
export async function handleSignInReturn(url: URL, res: ServerResponse): Promise<void> {
  const signIn = returningSignIn(url.searchParams.get("state") ?? "");
  const server = saved.find((entry) => entry.id === signIn?.serverId);
  if (!signIn || !server?.url) {
    page(
      res,
      400,
      "This sign-in link has expired",
      "Start signing in again from Citropy's settings.",
    );
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    page(
      res,
      400,
      `Didn't sign in to ${server.name}`,
      url.searchParams.get("error_description") ||
        url.searchParams.get("error") ||
        "The server didn't send a sign-in code.",
    );
    return;
  }
  try {
    await auth(signIn, { serverUrl: server.url, authorizationCode: code });
  } catch (error) {
    writeLog("warn", "mcp", `${server.name} sign-in failed: ${(error as Error).message}`);
    page(res, 502, `Didn't sign in to ${server.name}`, (error as Error).message);
    return;
  }
  await restart(server);
  page(res, 200, `Signed in to ${server.name}`, "You can close this tab and go back to Citropy.");
}

export function startMcpServers(): void {
  for (const server of saved) if (server.enabled) void start(server);
}

export async function stopMcpServers(): Promise<void> {
  await Promise.allSettled([...live.keys()].map(stop));
}
