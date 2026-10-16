import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ifMissing } from "../shared/expected-errors.mjs";
import { connectionMention, siteOf } from "../shared/connection-sites.mjs";
import suggestions from "../shared/connection-suggestions.json" with { type: "json" };
import type { session as sessions } from "electron";
import { clearProfileData } from "./browser-profiles.ts";

const MAX_CONNECTIONS = 50;
const MAX_ACCOUNTS = 10;
const MAX_NAME_LENGTH = 60;
const PROFILE_PREFIX = "connection-";

interface Account {
  id: string;
  label: string;
  signedIn: boolean;
}

interface Connection {
  id: string;
  name: string;
  url: string;
  accounts: Account[];
}

type StoredConnection = Omit<Connection, "accounts"> & { accounts?: Account[]; signedIn?: boolean };

// Comes from the renderer, so every field is checked before it is stored.
export interface ConnectionInput {
  name?: unknown;
  url?: unknown;
  id?: unknown;
  label?: unknown;
  signedIn?: unknown;
}

type ConnectionTabs = Map<string, { state: { profileId?: string } }>;

let connections: Connection[] = [];
let file = "";
let operations = Promise.resolve();

function fromSingleAccountFormat({ signedIn = false, ...connection }: StoredConnection): Connection {
  return { ...connection, accounts: connection.accounts ?? [{ id: connection.id, label: "", signedIn }] };
}

export async function initializeConnections(userData: string) {
  file = join(userData, "connections.json");
  connections = JSON.parse(await readFile(file, "utf8").catch(ifMissing("[]"))).map(fromSingleAccountFormat);
}

async function save() {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(connections), { mode: 0o600 });
  await rename(temporary, file);
}

function suggestionOf(connection: { url: string }) {
  const site = siteOf(connection.url);
  return suggestions.find((suggestion) => siteOf(suggestion.url) === site);
}

function extraSitesOf(connection: { url: string }) {
  return suggestionOf(connection)?.sites ?? [];
}

function longestMatch<T>(list: T[], host: string, sitesOf: (connection: T) => string[]) {
  return list
    .map((connection) => ({
      connection,
      length: Math.max(0, ...sitesOf(connection).filter((site) => host === site || host.endsWith(`.${site}`)).map((site) => site.length)),
    }))
    .filter((entry) => entry.length > 0)
    .sort((left, right) => right.length - left.length)[0]?.connection;
}

export function matchConnection<T extends { url: string }>(list: T[], address: string | undefined) {
  let host;
  try {
    host = new URL(address ?? "").hostname;
  } catch {
    return undefined;
  }
  return longestMatch(list, host, (connection) => [siteOf(connection.url)]) ?? longestMatch(list, host, extraSitesOf);
}

function profileOf(connection: Connection, account: Account) {
  return {
    id: `${PROFILE_PREFIX}${account.id}`,
    name: account.label ? `${connection.name} ${account.label}` : connection.name,
    partition: `persist:citropy-${PROFILE_PREFIX}${account.id}`,
  };
}

function mentionOf(connection: Connection, account: Account) {
  return connectionMention({ name: connection.name, site: siteOf(connection.url) }, account.label);
}

function allAccounts() {
  return connections.flatMap((connection) => connection.accounts.map((account) => ({ connection, account })));
}

function accountWithProfile(profileId: string | undefined) {
  return allAccounts().find(({ connection, account }) => profileOf(connection, account).id === profileId);
}

export function connectionProfile(profileId: string | undefined, address: string | undefined) {
  if (!profileId) {
    const match = matchConnection(connections, address);
    return match && profileOf(match, match.accounts[0]!);
  }
  if (!profileId.startsWith(PROFILE_PREFIX)) return undefined;
  const found = accountWithProfile(profileId);
  if (!found) throw new Error("This account was removed.");
  return profileOf(found.connection, found.account);
}

export function accountOfProfile(profileId: string | undefined) {
  const account = accountWithProfile(profileId)?.account;
  return account && { id: account.id, signedIn: account.signedIn };
}

export function signInTarget(id: unknown) {
  const { connection, account } = findAccount(id);
  return { ...profileOf(connection, account), id: account.id, url: connection.url };
}

function findConnection(id: unknown) {
  const connection = connections.find((entry) => entry.id === id);
  if (!connection) throw new Error("Connection not found.");
  return connection;
}

function findAccount(id: unknown) {
  const found = allAccounts().find(({ account }) => account.id === id);
  if (!found) throw new Error("Account not found.");
  return found;
}

function cleanName(value: unknown, missing: string) {
  const name = String(value ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error(missing);
  return name;
}

function assertMentionFree(connection: Connection, account: Account) {
  const mention = mentionOf(connection, account);
  if (allAccounts().some((entry) => mentionOf(entry.connection, entry.account) === mention))
    throw new Error(`Another account already uses @${mention}. Pick another name.`);
}

function view(connection: Connection) {
  const { id, name, url } = connection;
  const site = siteOf(url);
  const suggestion = suggestionOf(connection);
  return {
    id,
    name,
    url,
    site,
    sites: [site, ...(suggestion?.sites ?? [])],
    description: suggestion?.description ?? site,
    accounts: connection.accounts.map((account) => {
      const profile = profileOf(connection, account);
      return { id: account.id, name: profile.name, label: account.label, mention: mentionOf(connection, account), signedIn: account.signedIn, profileId: profile.id };
    }),
  };
}

async function apply(operation: string, input: ConnectionInput, session: typeof sessions, tabs: ConnectionTabs) {
  if (operation === "add") {
    const name = cleanName(input.name, "Enter a name.");
    const typed = String(input.url ?? "").trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`).href;
    const site = siteOf(url);
    if (connections.some((entry) => siteOf(entry.url) === site))
      throw new Error(`${site} is already connected. Use Add account on it for another account.`);
    if (connections.length >= MAX_CONNECTIONS) throw new Error(`Keep up to ${MAX_CONNECTIONS} connections.`);
    const account = { id: randomUUID(), label: "", signedIn: false };
    const connection = { id: randomUUID(), name, url, accounts: [account] };
    assertMentionFree(connection, account);
    connections.push(connection);
  } else if (operation === "add-account") {
    const connection = findConnection(input.id);
    const account = { id: randomUUID(), label: cleanName(input.label, "Enter an account name."), signedIn: false };
    if (connection.accounts.length >= MAX_ACCOUNTS) throw new Error(`Keep up to ${MAX_ACCOUNTS} accounts per connection.`);
    assertMentionFree(connection, account);
    connection.accounts.push(account);
  } else if (operation === "remove" || operation === "status") {
    const { connection, account } = findAccount(input.id);
    const signingOut = operation === "remove" || input.signedIn === false;
    const profile = profileOf(connection, account);
    if (signingOut && [...tabs.values()].some((tab) => tab.state.profileId === profile.id))
      throw new Error(`Close ${profile.name}'s browser tabs first.`);
    if (signingOut) await clearProfileData(session.fromPartition(profile.partition));
    if (operation === "status") account.signedIn = input.signedIn === true;
    else if (connection.accounts.length > 1) connection.accounts = connection.accounts.filter((entry) => entry !== account);
    else connections = connections.filter((entry) => entry !== connection);
  } else if (operation !== "list") throw new Error("Unknown connections action");
  if (operation !== "list") await save();
  return connections.map(view);
}

export function handleConnections(operation: string, input: ConnectionInput, session: typeof sessions, tabs: ConnectionTabs) {
  const result = operations.then(() => apply(operation, input, session, tabs));
  operations = result.then(() => {}, () => {});
  return result;
}
