import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { spawnAppImageRelaunch } from "../desktop/appimage-relaunch.mjs";

const until = async (probe, message) => {
  const deadline = Date.now() + 8000;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await probe();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await delay(50);
  }
  throw new Error(message + (last instanceof Error ? `: ${last.message}` : ""));
};

test("AppImage relaunch rejects unsafe paths", () => {
  const base = {
    downloadedFile: "/tmp/Citropy-next.AppImage",
    parentPid: 1,
    logFile: "/tmp/citropy-update.log",
  };
  assert.throws(
    () => spawnAppImageRelaunch({ ...base, appImage: "Citropy.AppImage" }),
    /absolute path/,
  );
  assert.throws(
    () =>
      spawnAppImageRelaunch({
        ...base,
        appImage: "/tmp/Citropy.AppImage",
        downloadedFile: "/tmp/Citropy.AppImage",
      }),
    /replace itself/,
  );
  assert.throws(
    () =>
      spawnAppImageRelaunch({
        ...base,
        appImage: "/tmp/Citropy.AppImage",
        parentPid: 0,
      }),
    /process id/,
  );
});

test(
  "AppImage apply waits for the running process before replacing and relaunching",
  { timeout: 15000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "citropy-appimage-relaunch-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const appImage = join(directory, "Citropy.AppImage");
    const downloaded = join(directory, "Citropy-next.AppImage");
    const launched = join(directory, "launched");
    const logFile = join(directory, "update.log");
    await writeFile(appImage, "old-install");
    await writeFile(
      downloaded,
      `#!/bin/sh\n[ "$1" = --appimage-extract ] && exit 1\nprintf 'APPDIR=%s\\nAPPIMAGE=%s\\n' "\${APPDIR-unset}" "\${APPIMAGE-unset}" > ${JSON.stringify(launched)}\n`,
    );
    await chmod(downloaded, 0o755);
    const parent = spawn("sleep", ["30"], { stdio: "ignore" });
    t.after(() => {
      parent.kill("SIGTERM");
    });
    spawnAppImageRelaunch({
      appImage,
      downloadedFile: downloaded,
      parentPid: parent.pid,
      logFile,
    });
    await delay(400);
    assert.equal(await readFile(appImage, "utf8"), "old-install");
    await assert.rejects(readFile(launched), /ENOENT/);
    parent.kill("SIGTERM");
    await until(
      async () => (await readFile(appImage, "utf8")).startsWith("#!/bin/sh"),
      "the installed AppImage should be replaced after the parent exits",
    );
    const mark = await until(
      async () => readFile(launched, "utf8"),
      "the new AppImage should launch after the parent exits",
    );
    assert.match(mark, /APPDIR=unset/);
    assert.match(mark, /APPIMAGE=unset/);
    assert.match(await readFile(logFile, "utf8"), /Replaced .* and relaunched/);
  },
);

test("AppImage updates refresh the installed icon without blocking relaunch on icon failures", async (t) => {
  for (const scenario of ["success", "extraction-failure", "cache-failure"]) {
    await t.test(scenario, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "citropy-appimage-icon-"));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const data = join(directory, "data");
      const icons = join(data, "icons/hicolor/512x512/apps");
      const commands = join(directory, "commands");
      const temporary = join(directory, "temporary");
      await Promise.all([mkdir(icons, { recursive: true }), mkdir(commands), mkdir(temporary)]);
      const icon = join(icons, "citropy.png");
      await writeFile(icon, "old-icon");
      const appImage = join(directory, "Citropy.AppImage");
      const downloaded = join(directory, "Citropy-next.AppImage");
      const launched = join(directory, "launched");
      const cacheLog = join(directory, "cache.log");
      await writeFile(appImage, "old-install");
      await writeFile(downloaded, `#!/bin/sh
if [ "\${1:-}" = --appimage-extract ]; then
  [ "$TEST_SCENARIO" != extraction-failure ] || exit 1
  mkdir -p "squashfs-root/$(dirname "$2")"
  printf new-icon > "squashfs-root/$2"
  exit 0
fi
printf relaunched > "$TEST_LAUNCHED"
`, { mode: 0o755 });
      for (const command of ["gtk-update-icon-cache", "kbuildsycoca6"]) {
        await writeFile(join(commands, command), `#!/bin/sh
printf '%s %s\\n' "$(basename "$0")" "$*" >> "$TEST_CACHE_LOG"
[ "$TEST_SCENARIO" != cache-failure ]
`, { mode: 0o755 });
      }
      const script = fileURLToPath(new URL("../desktop/apply-appimage-update.sh", import.meta.url));
      await promisify(execFile)("sh", [script], {
        env: {
          ...process.env,
          PATH: `${commands}:${process.env.PATH}`,
          TMPDIR: temporary,
          XDG_DATA_HOME: data,
          CITROPY_APPIMAGE: appImage,
          CITROPY_UPDATE_FILE: downloaded,
          CITROPY_PARENT_PID: "",
          TEST_LAUNCHED: launched,
          TEST_CACHE_LOG: cacheLog,
          TEST_SCENARIO: scenario,
        },
      });
      await until(() => readFile(launched, "utf8"), "Citropy should relaunch after refreshing the icon");
      assert.deepEqual(await readFile(appImage), await readFile(downloaded));
      assert.equal(await readFile(icon, "utf8"), scenario === "extraction-failure" ? "old-icon" : "new-icon");
      if (scenario !== "extraction-failure") {
        const cache = await readFile(cacheLog, "utf8");
        assert.ok(cache.includes(`gtk-update-icon-cache -f ${join(data, "icons/hicolor")}`));
        assert.match(cache, /kbuildsycoca6 --noincremental/);
      }
      assert.deepEqual(await readdir(temporary), []);
    });
  }
});

test(
  "AppImage restart waits for the running process then launches the current file",
  { timeout: 15000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "citropy-appimage-restart-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const appImage = join(directory, "Citropy.AppImage");
    const launched = join(directory, "launched");
    const logFile = join(directory, "update.log");
    await writeFile(
      appImage,
      `#!/bin/sh\nprintf relaunched > ${JSON.stringify(launched)}\n`,
    );
    await chmod(appImage, 0o755);
    const parent = spawn("sleep", ["30"], { stdio: "ignore" });
    t.after(() => {
      parent.kill("SIGTERM");
    });
    spawnAppImageRelaunch({
      appImage,
      parentPid: parent.pid,
      logFile,
    });
    await delay(400);
    await assert.rejects(readFile(launched), /ENOENT/);
    parent.kill("SIGTERM");
    await until(
      async () => readFile(launched, "utf8"),
      "the current AppImage should launch after the parent exits",
    );
    assert.match(await readFile(logFile, "utf8"), /Relaunched /);
  },
);
