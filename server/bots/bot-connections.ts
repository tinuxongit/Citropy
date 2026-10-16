import { bus } from "../bus.ts";
import { listConnections } from "../connections.ts";
import { desktopConnected, desktopRequest } from "../desktop.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import { logFailure } from "../../shared/expected-errors.mjs";
import type { Bot } from "../../shared/bots.ts";
import type { Connection } from "../../shared/features.ts";
import type { Thread } from "../../shared/protocol.ts";
import type { BrowserState } from "../../shared/workbench.ts";

export type SignIns = { all: Connection[]; connections: Connection[]; accounts: Set<string> };

bus.subscribe((event) => {
  if (event.t === "bot.remove" && desktopConnected())
    desktopRequest("profiles.forget-bot", { profileId: botProfileId(event.id) }).catch(
      logFailure("Clearing a deleted bot's browser profile", event.id),
    );
});

export function botProfileId(botId: string): string {
  return `bot-${botId}`;
}

/** The bot a conversation, or a subagent working for it, belongs to. */
export function botOf(thread: Thread | undefined): Bot | undefined {
  while (thread && !thread.botId)
    thread = thread.parentThreadId ? store.threads.get(thread.parentThreadId) : undefined;
  return thread?.botId ? botStore.bots.get(thread.botId) : undefined;
}

/** The connections a bot is signed in to. No pick means every connection. */
export async function signIns(bot: Bot): Promise<SignIns> {
  const all = await listConnections();
  const connections = bot.connections.length
    ? all.filter((connection) => bot.connections.includes(connection.id))
    : all;
  return {
    all,
    connections,
    accounts: new Set(
      connections.flatMap((connection) => connection.accounts.map((account) => account.id)),
    ),
  };
}

/** A bot only sees tabs it opened, and not ones signed in to a connection it no longer has. */
export async function botTabs(bot: Bot, tabs: BrowserState[]): Promise<BrowserState[]> {
  const own = tabs.filter((tab) => botOf(store.threads.get(tab.threadId ?? "")) === bot);
  if (!own.some((tab) => tab.account)) return own;
  const { accounts } = await signIns(bot);
  return own.filter((tab) => !tab.account || accounts.has(tab.account.id));
}

function longestMatch(
  list: Connection[],
  host: string,
  sitesOf: (connection: Connection) => string[],
): Connection | undefined {
  let best: { connection: Connection; length: number } | undefined;
  for (const connection of list) {
    const length = Math.max(
      0,
      ...sitesOf(connection)
        .filter((site) => host === site || host.endsWith(`.${site}`))
        .map((site) => site.length),
    );
    if (length > (best?.length ?? 0)) best = { connection, length };
  }
  return best?.connection;
}

/** Mirrors the desktop app's choice of which connection signs in a page opened without an account. */
export function connectionForUrl(list: Connection[], address: string): Connection | undefined {
  let host: string;
  try {
    host = new URL(address).hostname;
  } catch {
    return undefined;
  }
  return (
    longestMatch(list, host, (connection) => [connection.site]) ??
    longestMatch(list, host, (connection) => connection.sites.slice(1))
  );
}
