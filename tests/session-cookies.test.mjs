import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { keepSessionCookies, persistentCopy } from "../desktop/session-cookies.ts";

const LONGEST_SECONDS = 400 * 86_400;
const cookie = { name: "sid", value: "abc", domain: ".example.com", hostOnly: false, path: "/", secure: true, httpOnly: true, sameSite: "lax", session: true };

function fakeSession(storagePath) {
  const jar = new Map();
  const cookies = Object.assign(new EventEmitter(), {
    get: async () => [...jar.values()],
    set: async (details) => {
      const { url, expirationDate, ...rest } = details;
      const stored = { ...cookie, ...rest, domain: rest.domain ?? new URL(url).hostname, session: false, expirationDate };
      jar.set(stored.name, stored);
      cookies.emit("changed", {}, stored, "explicit", false);
    },
  });
  return { storagePath, cookies, jar };
}

test("a sign-in cookie that ends with the session is kept as long as the browser allows", () => {
  assert.deepEqual(persistentCopy(cookie, 1000), {
    url: "https://example.com/", name: "sid", value: "abc", domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", expirationDate: 1000 + LONGEST_SECONDS,
  });
});

test("a host-only cookie stays host-only", () => {
  const copy = persistentCopy({ ...cookie, name: "__Host-sid", domain: "app.example.com", hostOnly: true, secure: false }, 0);
  assert.equal(copy.url, "http://app.example.com/");
  assert.equal("domain" in copy, false);
});

test("kept sign-in cookies are renewed each time the app starts", async () => {
  const folder = await mkdtemp(join(tmpdir(), "citropy-cookies-"));
  try {
    const first = fakeSession(folder);
    await keepSessionCookies(first);
    first.cookies.emit("changed", {}, cookie, "explicit", false);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const restarted = fakeSession(folder);
    restarted.jar.set("sid", { ...cookie, session: false, expirationDate: 1 });
    restarted.jar.set("other", { ...cookie, name: "other", session: false, expirationDate: 1 });
    await keepSessionCookies(restarted);
    assert.ok(restarted.jar.get("sid").expirationDate > Date.now() / 1000 + LONGEST_SECONDS - 60);
    assert.equal(restarted.jar.get("other").expirationDate, 1);
  } finally {
    await rm(folder, { recursive: true });
  }
});
