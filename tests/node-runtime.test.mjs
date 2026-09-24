import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { remoteProxy } from "../desktop/remote-proxy.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { nodeChecksums, nodeVersion } from "../shared/node-runtime.mjs";

test("runtime installation verifies downloads, preserves system tools, and survives path setup", { timeout: 30000 }, async t => {
  const home = fs.mkdtempSync(join(os.tmpdir(), "citropy-node-install-"));
  const originalHome = os.homedir;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const platform = `${process.platform}-${process.arch}`;
  const checksum = nodeChecksums[platform];
  os.homedir = () => home;
  syncBuiltinESMExports();
  const tools = join(home, "tools");
  fs.mkdirSync(tools);
  fs.symlinkSync("/usr/bin/tar", join(tools, "tar"));
  fs.symlinkSync("/usr/bin/gzip", join(tools, "gzip"));
  process.env.PATH = tools;
  process.env.HOME = home;
  process.env.SHELL = "/bin/bash";
  process.env.CITROPY_DATA_DIR = join(home, "data");
  const { installNodeRuntime, nodeRuntimeStatus } = await import("../server/node-runtime.ts");
  const { clearCommandCache } = await import("../server/providers/binary.ts");
  t.after(() => {
    os.homedir = originalHome;
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    nodeChecksums[platform] = checksum;
    clearCommandCache();
    syncBuiltinESMExports();
    fs.rmSync(home, { recursive: true, force: true });
  });
  const wait = async () => {
    for (let i = 0; i < 300; i++) {
      const status = await nodeRuntimeStatus();
      if (status.status !== "installing") return status;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail("Runtime installation did not finish");
  };
  const { activeWork } = await import("../server/activity.ts");
  assert.equal(activeWork(), false);
  const { handleFeatures } = await import("../server/features.ts");
  const server = createServer((req, res) => {
    void handleFeatures(req, res, []).then(handled => {
      if (!handled) res.writeHead(404).end();
    }).catch(error => res.writeHead(500).end(error.message));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const proxy = await remoteProxy(origin);
  proxy.setTarget({ port, remotePort: port, token: "runtime-test" });
  t.after(async () => {
    await proxy.close();
    await new Promise(resolve => server.close(resolve));
  });
  for (const endpoint of [origin, proxy.endpoint]) {
    const response = await originalFetch(`${endpoint}/api/runtimes/node`, { headers: { origin } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ready, false);
  }
  for (const endpoint of [origin, proxy.endpoint]) {
    const denied = await originalFetch(`${endpoint}/api/runtimes/node`, {
      method: "POST", headers: { origin: "https://untrusted.example" },
    });
    assert.equal(denied.status, 403);
  }
  let downloads = 0;
  const download = Promise.withResolvers();
  globalThis.fetch = async () => { downloads++; await download.promise; return new Response("corrupt"); };
  const installing = await originalFetch(`${proxy.endpoint}/api/runtimes/node`, { method: "POST", headers: { origin } });
  assert.equal(installing.status, 200);
  assert.equal((await installing.json()).status, "installing");
  assert.throws(installNodeRuntime, /already being installed/);
  assert.equal(activeWork(), true);
  download.resolve();
  assert.match((await wait()).message, /integrity check/);
  assert.equal(activeWork(), false);
  assert.equal(fs.existsSync(join(home, ".citropy/runtimes")), false);
  assert.equal(process.env.PATH, tools);
  const packageName = `node-v${nodeVersion}-${platform}`;
  const payload = join(home, "payload", packageName);
  fs.mkdirSync(join(payload, "bin"), { recursive: true });
  fs.mkdirSync(join(payload, "lib/node_modules/npm/bin"), { recursive: true });
  fs.writeFileSync(join(payload, "bin/node"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v22.23.2; else test -f "$1" || exit 1; echo 10.9.8; fi\n', { mode: 0o755 });
  fs.writeFileSync(join(payload, "bin/npm"), "#!/bin/sh\necho 10.9.8\n", { mode: 0o755 });
  fs.writeFileSync(join(payload, "lib/node_modules/npm/bin/npm-cli.js"), "");
  const archive = execFileSync("/usr/bin/tar", ["-czf", "-", "-C", join(home, "payload"), packageName]);
  nodeChecksums[platform] = createHash("sha256").update(archive).digest("hex");
  globalThis.fetch = async () => { downloads++; return new Response(archive); };
  fs.writeFileSync(join(tools, "node"), "#!/bin/sh\necho v18.0.0\n", { mode: 0o755 });
  clearCommandCache();
  installNodeRuntime();
  const result = await wait();
  assert.equal(result.status, "success", result.message);
  assert.equal(result.ready, true);
  assert.equal(result.version, "v22.23.2");
  assert.equal(result.npmVersion, "10.9.8");
  assert.equal(result.shellReady, true);
  const bashrc = fs.readFileSync(join(home, ".bashrc"), "utf8");
  const profile = fs.readFileSync(join(home, ".profile"), "utf8");
  const shellEnv = { ...process.env, PATH: "/usr/bin:/bin" };
  assert.equal(execFileSync("/bin/bash", ["--noprofile", "--rcfile", join(home, ".bashrc"), "-ic", "node --version && npm --version"], { env: shellEnv, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "v22.23.2\n10.9.8");
  assert.equal(execFileSync("/bin/bash", ["-c", '. "$HOME/.profile"; node --version'], { env: shellEnv, encoding: "utf8" }).trim(), "v22.23.2");
  installNodeRuntime();
  assert.equal((await wait()).shellReady, true);
  assert.equal(fs.readFileSync(join(home, ".bashrc"), "utf8"), bashrc);
  assert.equal(fs.readFileSync(join(home, ".profile"), "utf8"), profile);
  fs.writeFileSync(join(home, ".bashrc"), "export KEEP_ME=1\n");
  assert.equal((await nodeRuntimeStatus()).shellReady, false);
  installNodeRuntime();
  assert.equal((await wait()).shellReady, true);
  assert.ok(fs.readFileSync(join(home, ".bashrc"), "utf8").startsWith("export KEEP_ME=1\n"));
  assert.match(fs.readFileSync(join(tools, "node"), "utf8"), /v18.0.0/);
  const root = join(home, ".citropy/runtimes");
  assert.deepEqual(fs.readdirSync(root), [packageName]);
  process.env.PATH = tools;
  clearCommandCache();
  installNodeRuntime();
  assert.equal((await wait()).ready, true);
  assert.equal(downloads, 2);
  const { augmentPath } = await import("../server/paths.ts");
  const environment = { PATH: tools };
  augmentPath(environment, home, process.platform);
  assert.ok(environment.PATH.startsWith(join(root, packageName, "bin")));
});
