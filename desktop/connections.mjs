import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ifMissing } from "../shared/expected-errors.mjs";
import { siteOf } from "../shared/connection-sites.mjs";
import suggestions from "../shared/connection-suggestions.json" with { type: "json" };
import { clearProfileData } from "./browser-profiles.mjs";

const MAX_CONNECTIONS = 50;
const MAX_NAME_LENGTH = 60;
const PROFILE_PREFIX = "connection-";

let connections = [];
let file;
let operations = Promise.resolve();

export async function initializeConnections(userData) {
  file = join(userData, "connections.json");
  connections = JSON.parse(await readFile(file, "utf8").catch(ifMissing("[]")));
}

async function save() {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(connections), { mode: 0o600 });
  await rename(temporary, file);
}

function extraSitesOf(connection) {
  const site = siteOf(connection.url);
  return suggestions.find((suggestion) => siteOf(suggestion.url) === site)?.sites ?? [];
}

function longestMatch(list, host, sitesOf) {
  return list
    .map((connection) => ({
      connection,
      length: Math.max(0, ...sitesOf(connection).filter((site) => host === site || host.endsWith(`.${site}`)).map((site) => site.length)),
    }))
    .filter((entry) => entry.length > 0)
    .sort((left, right) => right.length - left.length)[0]?.connection;
}

export function matchConnection(list, address) {
  let host;
  try {
    host = new URL(address).hostname;
  } catch {
    return undefined;
  }
  return longestMatch(list, host, (connection) => [siteOf(connection.url)]) ?? longestMatch(list, host, extraSitesOf);
}

function profileOf(connection) {
  return {
    id: `${PROFILE_PREFIX}${connection.id}`,
    name: connection.name,
    partition: `persist:citropy-${PROFILE_PREFIX}${connection.id}`,
  };
}

export function connectionProfile(profileId, address) {
  if (!profileId) {
    const match = matchConnection(connections, address);
    return match && profileOf(match);
  }
  if (!profileId.startsWith(PROFILE_PREFIX)) return undefined;
  const connection = connectionOfProfile(profileId);
  if (!connection) throw new Error("This connection was removed.");
  return profileOf(find(connection.id));
}

export function connectionOfProfile(profileId) {
  const connection = connections.find((entry) => profileId === `${PROFILE_PREFIX}${entry.id}`);
  return connection && { id: connection.id, signedIn: connection.signedIn };
}

export function signInTarget(id) {
  const connection = find(id);
  return { ...profileOf(connection), id: connection.id, url: connection.url };
}

function find(id) {
  const connection = connections.find((entry) => entry.id === id);
  if (!connection) throw new Error("Connection not found.");
  return connection;
}

async function apply(operation, input, session, tabs) {
  if (operation === "add") {
    const name = String(input.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (!name) throw new Error("Enter a name.");
    const typed = String(input.url ?? "").trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`).href;
    const site = siteOf(url);
    if (connections.some((entry) => siteOf(entry.url) === site)) throw new Error(`${site} is already connected.`);
    if (connections.length >= MAX_CONNECTIONS) throw new Error(`Keep up to ${MAX_CONNECTIONS} connections.`);
    connections.push({ id: randomUUID(), name, url, signedIn: false });
  } else if (operation === "remove" || operation === "status") {
    const connection = find(input.id);
    const signingOut = operation === "remove" || input.signedIn === false;
    const profile = profileOf(connection);
    if (signingOut && [...tabs.values()].some((tab) => tab.state.profileId === profile.id))
      throw new Error(`Close ${connection.name}'s browser tabs first.`);
    if (signingOut) await clearProfileData(session.fromPartition(profile.partition));
    if (operation === "remove") connections = connections.filter((entry) => entry !== connection);
    else connection.signedIn = input.signedIn === true;
  } else if (operation !== "list") throw new Error("Unknown connections action");
  if (operation !== "list") await save();
  return connections.map((connection) => {
    const { id, name, url, signedIn } = connection;
    const site = siteOf(url);
    return { id, name, url, site, sites: [site, ...extraSitesOf(connection)], signedIn };
  });
}

export function handleConnections(operation, input, session, tabs) {
  const result = operations.then(() => apply(operation, input, session, tabs));
  operations = result.then(() => {}, () => {});
  return result;
}
