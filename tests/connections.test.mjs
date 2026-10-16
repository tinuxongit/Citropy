import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initializeConnections,
  handleConnections,
  connectionProfile,
  accountOfProfile,
  matchConnection,
  signInTarget,
} from "../desktop/connections.ts";
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

test("a suggested connection also covers its provider's other domains", () => {
  const list = [{ id: "google", url: "https://www.google.com/" }];
  assert.equal(matchConnection(list, "https://mail.google.com/")?.id, "google");
  assert.equal(matchConnection(list, "https://gmail.com/")?.id, "google");
  assert.equal(matchConnection(list, "https://www.youtube.com/watch")?.id, "google");
  assert.equal(
    matchConnection(
      [...list, { id: "youtube", url: "https://youtube.com/" }],
      "https://www.youtube.com/",
    )?.id,
    "youtube",
  );
  assert.equal(
    matchConnection([{ id: "other", url: "https://example.com/" }], "https://gmail.com/"),
    undefined,
  );
});

function fakeSession(cleared) {
  return {
    fromPartition: (partition) => ({
      clearStorageData: async () => cleared.push(partition),
      clearCache: async () => {},
      clearCodeCaches: async () => {},
    }),
  };
}

test("each account keeps its own sign-in and signing out clears only that account", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-connections-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await initializeConnections(directory);
  const cleared = [];
  const tabs = new Map();
  const action = (operation, input = {}) =>
    handleConnections(operation, input, fakeSession(cleared), tabs);

  const [amazon] = await action("add", { name: "Amazon", url: "www.amazon.com" });
  const [main] = amazon.accounts;
  assert.deepEqual(amazon, {
    id: amazon.id,
    name: "Amazon",
    url: "https://www.amazon.com/",
    site: "amazon.com",
    sites: ["amazon.com"],
    description: "amazon.com",
    accounts: [
      {
        id: main.id,
        name: "Amazon",
        label: "",
        mention: "amazon",
        signedIn: false,
        profileId: `connection-${main.id}`,
      },
    ],
  });
  await assert.rejects(
    action("add", { name: "Again", url: "https://amazon.com/cart" }),
    /already connected. Use Add account/,
  );
  await assert.rejects(action("add", { name: "", url: "gmail.com" }), /Enter a name/);
  await assert.rejects(
    action("add-account", { id: amazon.id, label: " " }),
    /Enter an account name/,
  );
  await assert.rejects(
    action("add-account", { id: "missing", label: "Work" }),
    /Connection not found/,
  );

  const [, work] = (await action("add-account", { id: amazon.id, label: "Work" }))[0].accounts;
  assert.deepEqual(
    { name: work.name, label: work.label, mention: work.mention },
    { name: "Amazon Work", label: "Work", mention: "amazon-work" },
  );
  await assert.rejects(
    action("add-account", { id: amazon.id, label: "work" }),
    /already uses @amazon-work/,
  );
  const workProfile = connectionProfile(work.profileId, "https://www.amazon.com/");
  assert.deepEqual(workProfile, {
    id: work.profileId,
    name: "Amazon Work",
    partition: `persist:citropy-connection-${work.id}`,
  });

  const profile = connectionProfile(undefined, "https://smile.amazon.com/");
  assert.equal(profile.partition, `persist:citropy-connection-${main.id}`);
  assert.deepEqual((await action("remove", { id: work.id }))[0].accounts, [main]);
  assert.deepEqual(cleared, [workProfile.partition]);
  cleared.length = 0;
  assert.equal(connectionProfile(undefined, "https://example.com/"), undefined);
  assert.equal(connectionProfile("personal", "https://www.amazon.com/"), undefined);
  assert.deepEqual(connectionProfile(profile.id, "https://example.com/"), profile);

  assert.deepEqual(accountOfProfile(profile.id), { id: main.id, signedIn: false });
  assert.deepEqual(signInTarget(main.id), {
    ...profile,
    id: main.id,
    url: "https://www.amazon.com/",
  });
  assert.throws(() => signInTarget("missing"), /Account not found/);
  assert.equal(accountOfProfile("personal"), undefined);
  assert.equal(
    (await action("status", { id: main.id, signedIn: true }))[0].accounts[0].signedIn,
    true,
  );
  assert.deepEqual(accountOfProfile(profile.id), { id: main.id, signedIn: true });
  tabs.set("tab", { state: { profileId: profile.id } });
  await assert.rejects(
    action("status", { id: main.id, signedIn: false }),
    /Close Amazon's browser tabs first/,
  );
  tabs.clear();
  assert.equal(
    (await action("status", { id: main.id, signedIn: false }))[0].accounts[0].signedIn,
    false,
  );
  assert.deepEqual(cleared, [profile.partition]);

  assert.deepEqual(await action("remove", { id: main.id }), []);
  assert.throws(() => connectionProfile(profile.id, "https://www.amazon.com/"), /removed/);
  assert.equal(await readFile(join(directory, "connections.json"), "utf8"), "[]");
});

test("connections saved before accounts keep their sign-in and browser storage", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "citropy-connections-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "connections.json"),
    JSON.stringify([{ id: "old", name: "Google", url: "https://www.google.com/", signedIn: true }]),
  );
  await initializeConnections(directory);
  const [google] = await handleConnections("list", {}, fakeSession([]), new Map());
  assert.equal(google.description, "Gmail, Calendar, Drive, Docs, YouTube");
  assert.deepEqual(google.accounts, [
    {
      id: "old",
      name: "Google",
      label: "",
      mention: "google",
      signedIn: true,
      profileId: "connection-old",
    },
  ]);
  assert.equal(
    connectionProfile(undefined, "https://mail.google.com/").partition,
    "persist:citropy-connection-old",
  );
});
