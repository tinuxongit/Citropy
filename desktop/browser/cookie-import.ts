import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, pbkdf2Sync, createDecipheriv } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CookiesSetDetails, Session } from "electron";
import { ifMissing, logFailure, unlessCode } from "../../shared/expected-errors.mjs";

// A browser profile on this computer whose cookies can be copied into a Citropy profile.
type Source = { id: string; name: string; browser: string; path: string } & (
  { engine: "chromium"; application: string } | { engine: "firefox" }
);

// Firefox rows carry the camel-case columns and Chromium rows the snake-case ones.
interface CookieRow {
  host: string;
  host_key: string;
  name: string;
  value: string;
  path: string;
  encrypted_value: Uint8Array;
  originAttributes: string;
  top_frame_site_key: string;
  partition_key: string;
  expiry: number;
  expires_utc: number;
  isSecure: number;
  is_secure: number;
  isHttpOnly: number;
  is_httponly: number;
  sameSite: number;
  samesite: number;
}

type CookieKeys = Record<string, Buffer | undefined>;

const run = promisify(execFile);
const MAX_ROWS = 50_000;
const IMPORT_BATCH = 50;
const KEY_LOOKUP = { timeout: 30_000, maxBuffer: 4096 };
// Seconds between 1601-01-01, where Chromium's clock starts, and the Unix epoch.
const WINDOWS_EPOCH_OFFSET = 11_644_473_600;
// Chromium's cookie database version 24 started prefixing values with a hash of the host.
const HOST_HASH_VERSION = 24;
const SAME_SITE = ["no_restriction", "lax", "strict"] as const;
// Chromium encrypts with a fixed password when the system keyring is not in use.
const FALLBACK_KEY = pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");

// [display name, folder on Linux, folder on macOS, keyring application name]
const CHROMIUM_BROWSERS: Array<[string, string, string, string]> = [
  ["Chrome", "google-chrome", "Google/Chrome", "chrome"],
  ["Chromium", "chromium", "Chromium", "chromium"],
  ["Brave", "BraveSoftware/Brave-Browser", "BraveSoftware/Brave-Browser", "brave"],
  ["Edge", "microsoft-edge", "Microsoft Edge", "microsoft-edge"],
  ["Vivaldi", "vivaldi", "Vivaldi", "vivaldi"],
  ["Helium", "helium", "Helium", "helium"],
];

const sourceId = (path: string) => createHash("sha256").update(path).digest("hex").slice(0, 24);

function listFolder(path: string) {
  return readdir(path, { withFileTypes: true }).catch(unlessCode(["ENOENT", "ENOTDIR"], []));
}

// Chromium cookies are read on Linux and macOS only.
async function chromiumSources(): Promise<Source[]> {
  const linux = process.platform === "linux";
  if (process.platform !== "linux" && process.platform !== "darwin") return [];
  const root = linux ? join(homedir(), ".config") : join(homedir(), "Library/Application Support");
  const sources: Source[] = [];
  for (const [browser, linuxFolder, macFolder, application] of CHROMIUM_BROWSERS) {
    const folder = join(root, linux ? linuxFolder : macFolder);
    const localState = await readFile(join(folder, "Local State"), "utf8").catch(ifMissing("{}"));
    const names = JSON.parse(localState).profile?.info_cache ?? {};
    for (const entry of await listFolder(folder)) {
      if (!entry.isDirectory() || !/^(Default|Profile \d+)$/.test(entry.name)) continue;
      const path = [
        join(folder, entry.name, "Network/Cookies"),
        join(folder, entry.name, "Cookies"),
      ].find(existsSync);
      if (!path) continue;
      sources.push({
        id: sourceId(path),
        name: `${browser} · ${names[entry.name]?.name || entry.name}`,
        browser,
        path,
        application,
        engine: "chromium",
      });
    }
  }
  return sources;
}

function firefoxRoot() {
  if (process.platform === "linux") return join(homedir(), ".mozilla/firefox");
  if (process.platform === "darwin")
    return join(homedir(), "Library/Application Support/Firefox/Profiles");
  return join(process.env.APPDATA || homedir(), "Mozilla/Firefox/Profiles");
}

async function firefoxSources(): Promise<Source[]> {
  const root = firefoxRoot();
  const sources: Source[] = [];
  for (const entry of await listFolder(root)) {
    const path = join(root, entry.name, "cookies.sqlite");
    if (!entry.isDirectory() || !existsSync(path)) continue;
    sources.push({
      id: sourceId(path),
      name: `Firefox · ${entry.name}`,
      browser: "Firefox",
      path,
      engine: "firefox",
    });
  }
  return sources;
}

async function findSources() {
  return [...(await chromiumSources()), ...(await firefoxSources())];
}

// What the settings screen shows. Paths stay in the desktop app.
export async function listCookieSources() {
  return (await findSources()).map(({ id, name, browser }) => ({ id, name, browser }));
}

export function decryptCookie(
  encrypted: Uint8Array,
  host: string,
  version: number,
  keys: CookieKeys,
) {
  const buffer = Buffer.from(encrypted);
  const prefix = buffer.subarray(0, 3).toString();
  if (!["v10", "v11"].includes(prefix)) return null;
  const key = keys[prefix];
  if (!key) return null;
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
    let plain = Buffer.concat([decipher.update(buffer.subarray(3)), decipher.final()]);
    if (version >= HOST_HASH_VERSION) {
      if (!plain.subarray(0, 32).equals(createHash("sha256").update(host).digest())) return null;
      plain = plain.subarray(32);
    }
    return isUtf8(plain) ? plain.toString("utf8") : null;
  } catch {
    // A wrong key or a corrupt value fails padding checks. That cookie is skipped.
    return null;
  }
}

// Reads in a transaction that is rolled back, so the source database is never changed.
async function readRows(source: Source) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(source.path, { readOnly: true, timeout: 3000 });
  try {
    database.exec("BEGIN");
    const query =
      source.engine === "firefox"
        ? `SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite, originAttributes FROM moz_cookies LIMIT ${MAX_ROWS}`
        : `SELECT * FROM cookies LIMIT ${MAX_ROWS}`;
    const rows = database.prepare(query).all() as unknown as CookieRow[];
    const version =
      source.engine === "chromium"
        ? Number(database.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value || 0)
        : 0;
    database.exec("ROLLBACK");
    return { rows, version };
  } finally {
    database.close();
  }
}

// Chromium encrypts with a password from the macOS Keychain or the Linux secret service.
async function cookieKeys(source: Source, rows: CookieRow[]): Promise<CookieKeys> {
  const keys: CookieKeys = { v10: FALLBACK_KEY };
  if (source.engine !== "chromium") return keys;
  const mac = process.platform === "darwin";
  const usesKeyring = rows.some(
    (row) => Buffer.from(row.encrypted_value).subarray(0, 3).toString() === "v11",
  );
  if (!mac && !usesKeyring) return keys;
  const lookup = mac
    ? run(
        "security",
        ["find-generic-password", "-w", "-s", `${source.browser} Safe Storage`],
        KEY_LOOKUP,
      )
    : run("secret-tool", ["lookup", "application", source.application], KEY_LOOKUP);
  const result = await lookup.catch(logFailure("Reading the browser cookie key", source.browser));
  if (!result?.stdout) return keys;
  const password = result.stdout.replace(/\r?\n$/, "");
  keys[mac ? "v10" : "v11"] = pbkdf2Sync(password, "saltysalt", mac ? 1003 : 1, 16, "sha1");
  return keys;
}

// Converts a database row to an Electron cookie, or null when it cannot or should not be
// imported: partitioned, unreadable or expired.
function toCookie(
  row: CookieRow,
  source: Source,
  version: number,
  keys: CookieKeys,
): CookiesSetDetails | null {
  const firefox = source.engine === "firefox";
  const partitioned = firefox ? row.originAttributes : row.top_frame_site_key || row.partition_key;
  if (partitioned) return null;
  const host = firefox ? row.host : row.host_key;
  const value =
    firefox || row.value ? row.value : decryptCookie(row.encrypted_value, host, version, keys);
  if (value === null) return null;
  const expirationDate = firefox
    ? Number(row.expiry)
    : Number(row.expires_utc) / 1_000_000 - WINDOWS_EPOCH_OFFSET;
  if (expirationDate > 0 && expirationDate < Date.now() / 1000) return null;
  const secure = Boolean(firefox ? row.isSecure : row.is_secure);
  const path = row.path || "/";
  const cookie: CookiesSetDetails = {
    url: `${secure ? "https" : "http"}://${host.replace(/^\./, "")}${path}`,
    name: row.name,
    value,
    path,
    secure,
    httpOnly: Boolean(firefox ? row.isHttpOnly : row.is_httponly),
    sameSite: SAME_SITE[firefox ? row.sameSite : row.samesite] ?? "unspecified",
  };
  // A __Host- cookie must stay host-only, so it never gets a domain.
  if (host.startsWith(".") && !row.name.startsWith("__Host-")) cookie.domain = host;
  if (expirationDate > 0) cookie.expirationDate = expirationDate;
  return cookie;
}

// Copies a source browser profile's cookies into a Citropy profile.
export async function importCookies(target: Session, sourceId: unknown) {
  const source = (await findSources()).find((entry) => entry.id === sourceId);
  if (!source) throw new Error("Source browser profile not found.");
  const { rows, version } = await readRows(source);
  const keys = await cookieKeys(source, rows);
  const cookies = rows.map((row) => toCookie(row, source, version, keys));
  let imported = 0;
  let skipped = cookies.filter((cookie) => cookie === null).length;
  const valid = cookies.filter((cookie) => cookie !== null);
  for (let index = 0; index < valid.length; index += IMPORT_BATCH)
    await Promise.all(
      valid.slice(index, index + IMPORT_BATCH).map(async (cookie) => {
        try {
          await target.cookies.set(cookie);
          imported++;
        } catch {
          // Chromium refuses some cookies, such as ones for invalid domains. Count them.
          skipped++;
        }
      }),
    );
  await target.cookies.flushStore();
  return { imported, skipped };
}
