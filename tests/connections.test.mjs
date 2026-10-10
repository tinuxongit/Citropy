import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeConnections, handleConnections, connectionProfile, connectionOfProfile, matchConnection, signInTarget } from "../desktop/connections.mjs";
import { siteOf } from "../shared/connection-sites.mjs";

test("connected sites match their own subdomains and prefer the most specific site", () => {
  const list = [
    { id: "google", url: "https://www.google.com/" },
    { id: "mail", url: "https://mail.google.com/" },
  ];
  assert.equal(siteOf("https://www.amazon.com/orders"), "amazon.com");
  assert.throws(() => siteOf("file:///etc/passwd"), /https:\/\//);
  assert.equal(matchConnection(list, "https://mail.google.com/u/0")?.id, "mail");
  assert.equal(matchConnection(list, "https://docs.google.com/")?.id, "google");
  assert.equal(matchConnection(list, "https://notgoogle.com/"), undefined);
  assert.equal(matchConnection(list, "not a url"), undefined);
});

test("each connection keeps its own sign-in and signing out clears only that site", async t => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-connections-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await initializeConnections(directory);
  const cleared = [];
  const session = {
    fromPartition: partition => ({
      clearStorageData: async () => cleared.push(partition),
      clearCache: async () => {},
      clearCodeCaches: async () => {},
    }),
  };
  const tabs = new Map();
  const action = (operation, input = {}) => handleConnections(operation, input, session, tabs);

  const [amazon] = await action("add", { name: "Amazon", url: "www.amazon.com" });
  assert.deepEqual(amazon, { id: amazon.id, name: "Amazon", url: "https://www.amazon.com/", site: "amazon.com", signedIn: false });
  await assert.rejects(action("add", { name: "Again", url: "https://amazon.com/cart" }), /already connected/);
  await assert.rejects(action("add", { name: "", url: "gmail.com" }), /Enter a name/);

  const profile = connectionProfile(undefined, "https://smile.amazon.com/");
  assert.equal(profile.partition, `persist:citropy-connection-${amazon.id}`);
  assert.equal(connectionProfile(undefined, "https://example.com/"), undefined);
  assert.equal(connectionProfile("personal", "https://www.amazon.com/"), undefined);
  assert.deepEqual(connectionProfile(profile.id, "https://example.com/"), profile);

  assert.deepEqual(connectionOfProfile(profile.id), { id: amazon.id, signedIn: false });
  assert.deepEqual(signInTarget(amazon.id), { ...profile, id: amazon.id, url: "https://www.amazon.com/" });
  assert.throws(() => signInTarget("missing"), /Connection not found/);
  assert.equal(connectionOfProfile("personal"), undefined);
  assert.equal((await action("status", { id: amazon.id, signedIn: true }))[0].signedIn, true);
  assert.deepEqual(connectionOfProfile(profile.id), { id: amazon.id, signedIn: true });
  tabs.set("tab", { state: { profileId: profile.id } });
  await assert.rejects(action("status", { id: amazon.id, signedIn: false }), /Close Amazon's browser tabs first/);
  tabs.clear();
  assert.equal((await action("status", { id: amazon.id, signedIn: false }))[0].signedIn, false);
  assert.deepEqual(cleared, [profile.partition]);

  assert.deepEqual(await action("remove", { id: amazon.id }), []);
  assert.throws(() => connectionProfile(profile.id, "https://www.amazon.com/"), /removed/);
  assert.equal(await readFile(join(directory, "connections.json"), "utf8"), "[]");
});
