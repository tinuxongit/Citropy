import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ifMissing, logFailure } from "../shared/expected-errors.mjs";

const BROWSER_LONGEST_COOKIE_DAYS = 400;
const DAY_SECONDS = 86_400;
const KEPT_LIST_FILE = "kept-session-cookies.json";

const renewals = new WeakMap();

export function persistentCopy(cookie, nowSeconds) {
  const host = cookie.domain.replace(/^\./, "");
  return {
    url: `${cookie.secure ? "https" : "http"}://${host}${cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: nowSeconds + BROWSER_LONGEST_COOKIE_DAYS * DAY_SECONDS,
  };
}

const keyOf = (cookie) => JSON.stringify([cookie.domain, cookie.path, cookie.name]);

export function keepSessionCookies(target) {
  if (renewals.has(target)) return renewals.get(target);
  const file = join(target.storagePath, KEPT_LIST_FILE);
  const keys = new Set();
  let saving = Promise.resolve();
  const extend = (cookie) =>
    target.cookies.set(persistentCopy(cookie, Date.now() / 1000)).catch(logFailure("Keeping a sign-in cookie", cookie.domain, cookie.name));
  const renewed = readFile(file, "utf8")
    .catch(ifMissing("[]"))
    .then(async (text) => {
      for (const key of JSON.parse(text)) keys.add(key);
      const cookies = await target.cookies.get({});
      await Promise.all(cookies.filter((cookie) => keys.has(keyOf(cookie))).map(extend));
    })
    .catch(logFailure("Renewing sign-in cookies", file));
  renewals.set(target, renewed);
  target.cookies.on("changed", (_, cookie, __, removed) => {
    if (removed || !cookie.session) return;
    void extend(cookie);
    void renewed.then(() => {
      if (keys.has(keyOf(cookie))) return;
      keys.add(keyOf(cookie));
      saving = saving.then(() => writeFile(file, JSON.stringify([...keys]))).catch(logFailure("Saving kept sign-in cookies", file));
    });
  });
  return renewed;
}
