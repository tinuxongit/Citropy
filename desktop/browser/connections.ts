import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ifMissing } from "../../shared/expected-errors.mjs";
import { saveJson } from "../../shared/save-json.ts";
import { connectionMention, siteOf } from "../../shared/connection-sites.mjs";
import suggestions from "../../shared/connection-suggestions.json" with { type: "json" };
import { clearProfileData, type OpenTab, type Sessions } from "./profiles.ts";

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

// Before accounts, a connection was one account with its own signedIn flag.
type StoredConnection = Omit<Connection, "accounts"> & { accounts?: Account[]; signedIn?: boolean };

// Comes from the renderer, so every field is checked before it is stored.
export interface ConnectionInput {
  name?: unknown;
  url?: unknown;
  id?: unknown;
  label?: unknown;
  signedIn?: unknown;
}

function fromSingleAccountFormat({
  signedIn = false,
  ...connection
}: StoredConnection): Connection {
  return {
    ...connection,
    accounts: connection.accounts ?? [{ id: connection.id, label: "", signedIn }],
  };
}

function suggestionOf(connection: { url: string }) {
  const site = siteOf(connection.url);
  return suggestions.find((suggestion) => siteOf(suggestion.url) === site);
}

function extraSitesOf(connection: { url: string }) {
  return suggestionOf(connection)?.sites ?? [];
}

// The connection with the longest site the host belongs to, so mail.google.com picks a
// Gmail connection over a Google one.
function longestMatch<T>(list: T[], host: string, sitesOf: (connection: T) => string[]) {
  const matchLength = (connection: T) => {
    const sites = sitesOf(connection).filter((site) => host === site || host.endsWith(`.${site}`));
    return Math.max(0, ...sites.map((site) => site.length));
  };
  return list
    .map((connection) => ({ connection, length: matchLength(connection) }))
    .filter((entry) => entry.length > 0)
    .sort((left, right) => right.length - left.length)[0]?.connection;
}

// The connection an address belongs to: by its own site first, then by its related sites.
export function matchConnection<T extends { url: string }>(list: T[], address: string | undefined) {
  let host;
  try {
    host = new URL(address ?? "").hostname;
  } catch {
    // Not an address, so it belongs to no connection.
    return undefined;
  }
  return (
    longestMatch(list, host, (connection) => [siteOf(connection.url)]) ??
    longestMatch(list, host, extraSitesOf)
  );
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

function cleanName(value: unknown, missing: string) {
  const name = String(value ?? "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error(missing);
  return name;
}

// Accepts "github.com" as well as a full address.
function cleanUrl(value: unknown) {
  const typed = String(value ?? "").trim();
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(typed);
  return new URL(hasScheme ? typed : `https://${typed}`).href;
}

// What the settings screen shows for a connection.
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
      return {
        id: account.id,
        name: profile.name,
        label: account.label,
        mention: mentionOf(connection, account),
        signedIn: account.signedIn,
        profileId: profile.id,
      };
    }),
  };
}

// Sites the user signs in to once. Each account browses in its own profile, which agents
// reach by mentioning the account or by opening one of its addresses.
export class Connections {
  readonly #file: string;
  readonly #sessions: Sessions;
  #connections: Connection[];
  #operations = Promise.resolve();

  static async load(userData: string, sessions: Sessions) {
    const file = join(userData, "connections.json");
    const stored: StoredConnection[] = JSON.parse(
      await readFile(file, "utf8").catch(ifMissing("[]")),
    );
    return new Connections(file, sessions, stored.map(fromSingleAccountFormat));
  }

  constructor(file: string, sessions: Sessions, connections: Connection[]) {
    this.#file = file;
    this.#sessions = sessions;
    this.#connections = connections;
  }

  // The profile a tab opens in. Without a profile id, an address on a connected site opens
  // in that connection's first account. Returns undefined when no connection applies.
  profileFor(profileId: string | undefined, address: string | undefined) {
    if (!profileId) {
      const match = matchConnection(this.#connections, address);
      return match && profileOf(match, match.accounts[0]!);
    }
    if (!profileId.startsWith(PROFILE_PREFIX)) return undefined;
    const found = this.#accountWithProfile(profileId);
    if (!found) throw new Error("This account was removed.");
    return profileOf(found.connection, found.account);
  }

  accountOf(profileId: string | undefined) {
    const account = this.#accountWithProfile(profileId)?.account;
    return account && { id: account.id, signedIn: account.signedIn };
  }

  // Where the sign-in window for an account opens, and in which profile.
  signInTarget(id: unknown) {
    const { connection, account } = this.#findAccount(id);
    return { ...profileOf(connection, account), id: account.id, url: connection.url };
  }

  // Runs one operation at a time, so overlapping requests cannot undo each other's saves.
  handle(operation: string, input: ConnectionInput, openTabs: OpenTab[]) {
    const result = this.#operations.then(() => this.#apply(operation, input, openTabs));
    this.#operations = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async #apply(operation: string, input: ConnectionInput, openTabs: OpenTab[]) {
    switch (operation) {
      case "list":
        return this.#connections.map(view);
      case "add":
        this.#add(input);
        break;
      case "add-account":
        this.#addAccount(input);
        break;
      case "remove":
        await this.#remove(input.id, openTabs);
        break;
      case "status":
        await this.#setStatus(input, openTabs);
        break;
      default:
        throw new Error("Unknown connections action");
    }
    saveJson(this.#file, this.#connections);
    return this.#connections.map(view);
  }

  #add(input: ConnectionInput) {
    const name = cleanName(input.name, "Enter a name.");
    const url = cleanUrl(input.url);
    const site = siteOf(url);
    if (this.#connections.some((entry) => siteOf(entry.url) === site))
      throw new Error(`${site} is already connected. Use Add account on it for another account.`);
    if (this.#connections.length >= MAX_CONNECTIONS)
      throw new Error(`Keep up to ${MAX_CONNECTIONS} connections.`);
    const account = { id: randomUUID(), label: "", signedIn: false };
    const connection = { id: randomUUID(), name, url, accounts: [account] };
    this.#assertMentionFree(connection, account);
    this.#connections.push(connection);
  }

  #addAccount(input: ConnectionInput) {
    const connection = this.#findConnection(input.id);
    const account = {
      id: randomUUID(),
      label: cleanName(input.label, "Enter an account name."),
      signedIn: false,
    };
    if (connection.accounts.length >= MAX_ACCOUNTS)
      throw new Error(`Keep up to ${MAX_ACCOUNTS} accounts per connection.`);
    this.#assertMentionFree(connection, account);
    connection.accounts.push(account);
  }

  async #remove(id: unknown, openTabs: OpenTab[]) {
    const { connection, account } = this.#findAccount(id);
    await this.#signOut(connection, account, openTabs);
    if (connection.accounts.length > 1)
      connection.accounts = connection.accounts.filter((entry) => entry !== account);
    else this.#connections = this.#connections.filter((entry) => entry !== connection);
  }

  async #setStatus(input: ConnectionInput, openTabs: OpenTab[]) {
    const { connection, account } = this.#findAccount(input.id);
    if (input.signedIn === false) await this.#signOut(connection, account, openTabs);
    account.signedIn = input.signedIn === true;
  }

  // Signing out clears the account's profile, which its open tabs are still using.
  async #signOut(connection: Connection, account: Account, openTabs: OpenTab[]) {
    const profile = profileOf(connection, account);
    if (openTabs.some((tab) => tab.profileId === profile.id))
      throw new Error(`Close ${profile.name}'s browser tabs first.`);
    await clearProfileData(this.#sessions.fromPartition(profile.partition));
  }

  #assertMentionFree(connection: Connection, account: Account) {
    const mention = mentionOf(connection, account);
    const taken = this.#allAccounts().some(
      (entry) => mentionOf(entry.connection, entry.account) === mention,
    );
    if (taken) throw new Error(`Another account already uses @${mention}. Pick another name.`);
  }

  #allAccounts() {
    return this.#connections.flatMap((connection) =>
      connection.accounts.map((account) => ({ connection, account })),
    );
  }

  #accountWithProfile(profileId: string | undefined) {
    return this.#allAccounts().find(
      ({ connection, account }) => profileOf(connection, account).id === profileId,
    );
  }

  #findConnection(id: unknown) {
    const connection = this.#connections.find((entry) => entry.id === id);
    if (!connection) throw new Error("Connection not found.");
    return connection;
  }

  #findAccount(id: unknown) {
    const found = this.#allAccounts().find(({ account }) => account.id === id);
    if (!found) throw new Error("Account not found.");
    return found;
  }
}
