import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyLoginShellPath } from "../desktop/login-path.ts";

test("applyLoginShellPath puts the login shell's PATH first, skipping startup noise", async (t) => {
  if (process.platform === "win32") return t.skip("no login shell on Windows");
  const dir = mkdtempSync(join(tmpdir(), "citropy-login-path-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const shell = join(dir, "shell");
  writeFileSync(
    shell,
    '#!/bin/sh\necho "Welcome back"\nPATH="/home/tester/.nvm/bin:/usr/bin" /bin/sh -c "$2"\necho bye\n',
  );
  chmodSync(shell, 0o755);
  const env = { SHELL: shell, PATH: "/usr/bin:/bin" };
  await applyLoginShellPath(env);
  assert.equal(env.PATH, "/home/tester/.nvm/bin:/usr/bin:/bin");
});
