import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { freePort } from "../shared/ports.mjs";

const directory = mkdtempSync(join(tmpdir(), "citropy-tailscale-"));
const bin = join(directory, "bin");
const stateFile = join(directory, "tailscale.json");
const upstreamPort = await freePort();
const upstream = createServer((req, res) =>
  res.end(
    JSON.stringify({ host: req.headers.host, device: req.headers["x-citropy-device"] ?? null }),
  ),
);
await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));

process.env.CITROPY_DATA_DIR = join(directory, "data");
process.env.CITROPY_PORT = String(upstreamPort);
process.env.FAKE_TAILSCALE_STATE = stateFile;
mkdirSync(bin);
mkdirSync(process.env.CITROPY_DATA_DIR);

const { clearCommandCache } = await import("../server/providers/binary.ts");
const { createPairing, removeDevice, setTailscaleSharing, sharingState } =
  await import("../server/sharing/sharing.ts");
test.after(async () => {
  await setTailscaleSharing(false);
  upstream.close();
  rmSync(directory, { recursive: true, force: true });
});

const writeFake = (state) => {
  writeFileSync(`${stateFile}.tmp`, JSON.stringify(state));
  renameSync(`${stateFile}.tmp`, stateFile);
};
const fakeState = (state) =>
  writeFake({
    running: true,
    backend: "Running",
    dns: "laptop.tail.ts.net.",
    approved: true,
    denied: false,
    calls: [],
    ...state,
  });
const readFake = () => JSON.parse(readFileSync(stateFile, "utf8"));

function installFake() {
  const script = join(bin, "tailscale");
  writeFileSync(
    script,
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dirname, "fixtures", "fake-tailscale.mjs")}" "$@"\n`,
  );
  chmodSync(script, 0o755);
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
  clearCommandCache();
}

async function waitFor(status) {
  for (let i = 0; i < 200; i++) {
    const state = sharingState().tailscale;
    if (state.status === status) return state;
    await sleep(25);
  }
  assert.fail(
    `Tailscale sharing never reached ${status}: ${JSON.stringify(sharingState().tailscale)}`,
  );
}

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, headers, agent: false }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    })
      .on("error", reject)
      .end();
  });
}

const savedSettings = () =>
  JSON.parse(readFileSync(join(process.env.CITROPY_DATA_DIR, "lan-sharing.json"), "utf8"));

test(
  "Tailscale sharing explains a missing install with a download link",
  { skip: process.platform === "win32" },
  async () => {
    clearCommandCache();
    const original = process.env.PATH;
    process.env.PATH = bin;
    try {
      await setTailscaleSharing(true);
      const state = await waitFor("problem");
      assert.match(state.message, /not installed/);
      assert.equal(state.link.url, "https://tailscale.com/download");
    } finally {
      await setTailscaleSharing(false);
      process.env.PATH = original;
      clearCommandCache();
    }
  },
);

test(
  "Tailscale sharing waits for HTTPS approval, then pairs devices over the tailnet address",
  { skip: process.platform === "win32" },
  async () => {
    installFake();
    fakeState({ approved: false });
    await setTailscaleSharing(true);
    const approval = await waitFor("approval");
    assert.equal(approval.link.url, "https://login.tailscale.com/f/serve?node=fake");
    fakeState({ ...readFake(), approved: true });
    const on = await waitFor("on");
    assert.equal(on.url, "https://laptop.tail.ts.net/");
    const { tailscalePort } = savedSettings();
    assert.equal(readFake().target, `http://127.0.0.1:${tailscalePort}`);

    assert.equal((await get(tailscalePort, "/")).status, 401);
    const pairing = createPairing("tailscale");
    assert.match(pairing.url, /^https:\/\/laptop\.tail\.ts\.net\/pair\?code=/);
    const paired = await get(
      tailscalePort,
      new URL(pairing.url).pathname + new URL(pairing.url).search,
      { "user-agent": "Mozilla/5.0 (iPhone)" },
    );
    assert.equal(paired.status, 302);
    const cookie = paired.headers["set-cookie"][0];
    assert.match(cookie, /; Secure/);
    assert.equal(
      (await get(tailscalePort, new URL(pairing.url).pathname + new URL(pairing.url).search))
        .status,
      403,
    );

    const proxied = await get(tailscalePort, "/api/anything", {
      cookie: cookie.split(";")[0],
      host: "laptop.tail.ts.net",
    });
    const device = sharingState().devices.find((entry) => entry.route === "tailscale");
    assert.equal(device.name, "iPhone");
    assert.deepEqual(JSON.parse(proxied.body), {
      host: `127.0.0.1:${upstreamPort}`,
      device: device.id,
    });
    assert.equal(
      (await get(tailscalePort, "/mcp/x", { cookie: cookie.split(";")[0] })).status,
      403,
    );

    removeDevice(device.id);
    assert.equal((await get(tailscalePort, "/", { cookie: cookie.split(";")[0] })).status, 401);

    await setTailscaleSharing(false);
    assert.equal(sharingState().tailscale.status, "off");
    assert.equal(readFake().target, undefined);
    assert.throws(() => createPairing("tailscale"), /not ready/);
  },
);

test(
  "Tailscale sharing leaves another program's HTTPS address alone",
  { skip: process.platform === "win32" },
  async () => {
    installFake();
    fakeState({ target: "http://127.0.0.1:9999" });
    await setTailscaleSharing(true);
    const state = await waitFor("problem");
    assert.match(state.message, /already shares http:\/\/127\.0\.0\.1:9999/);
    assert.equal(state.command, "tailscale serve --https=443 off");
    await setTailscaleSharing(false);
    assert.equal(readFake().target, "http://127.0.0.1:9999");
  },
);

test(
  "Tailscale sharing asks for operator permission and reports a stopped Tailscale",
  { skip: process.platform === "win32" },
  async () => {
    installFake();
    fakeState({ denied: true });
    await setTailscaleSharing(true);
    const denied = await waitFor("problem");
    assert.match(denied.message, /needs your permission/);
    assert.match(denied.command, /^sudo tailscale set --operator=/);
    await setTailscaleSharing(false);

    fakeState({ backend: "NeedsLogin" });
    await setTailscaleSharing(true);
    assert.match((await waitFor("problem")).message, /not connected/);
    await setTailscaleSharing(false);

    fakeState({ running: false });
    await setTailscaleSharing(true);
    assert.match((await waitFor("problem")).message, /not running/);
    await setTailscaleSharing(false);
  },
);
