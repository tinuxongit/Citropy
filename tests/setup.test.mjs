import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "citropy-setup-data-"));
process.env.CITROPY_DATA_DIR = dataDir;
const { gitInstallPlan } = await import("../server/git-runtime.ts");
const { git, isRepo } = await import("../server/git.ts");
const { claudeProvider } = await import("../server/providers/claude.ts");
const { codexProvider } = await import("../server/providers/codex.ts");
const { opencodeProvider } = await import("../server/providers/opencode.ts");
const { terminalRoutes } = await import("../server/routes/terminals.ts");

test.after(() => rm(dataDir, { recursive: true, force: true }));

test("git install plan picks a method for each system", () => {
  const has = (...commands) => command => commands.includes(command);
  assert.equal(gitInstallPlan("darwin", "arm64", has()).kind, "apple");
  assert.equal(gitInstallPlan("win32", "x64", has()).kind, "download");
  assert.deepEqual(gitInstallPlan("linux", "x64", has("pacman", "pkexec")), {
    kind: "package",
    method: "Installs git with pacman. Your system asks for your password.",
    command: "pkexec",
    args: ["pacman", "-S", "--needed", "--noconfirm", "git"],
  });
  assert.equal(gitInstallPlan("linux", "x64", has("apt-get", "pkexec")).args[0], "apt-get");
  assert.match(gitInstallPlan("linux", "x64", has("dnf")).method, /Run "sudo dnf install -y git" in a terminal/);
  assert.equal(gitInstallPlan("linux", "x64", has("pkexec")).kind, "manual");
});

test("a folder is not a repository when git is missing", async t => {
  const folder = await mkdtemp(join(tmpdir(), "citropy-no-git-"));
  const path = process.env.PATH;
  process.env.PATH = folder;
  t.after(async () => {
    process.env.PATH = path;
    await rm(folder, { recursive: true, force: true });
  });
  assert.equal(await isRepo(folder), false);
  await assert.rejects(git(folder, ["status"]), { code: "ENOENT", message: /Git is not installed/ });
});

test("provider sign-in status output is read", () => {
  assert.equal(claudeProvider.signIn.signedIn('{\n  "loggedIn": true,\n  "authMethod": "claude.ai"\n}'), true);
  assert.equal(claudeProvider.signIn.signedIn('{\n  "loggedIn": false\n}'), false);
  assert.equal(codexProvider.signIn.signedIn("Logged in using ChatGPT"), true);
  assert.equal(codexProvider.signIn.signedIn("Not logged in"), false);
  assert.equal(opencodeProvider.signIn.signedIn("│\n└  4 environment variables"), true);
  assert.equal(opencodeProvider.signIn.signedIn("┌  Credentials\n│\n└  1 credential"), true);
  assert.equal(opencodeProvider.signIn.signedIn("┌  Credentials\n│\n└  0 credentials"), false);
});

test("a sign-in terminal only opens under its own provider's id", async () => {
  const sent = [];
  const open = (termId, signIn) => terminalRoutes["term.open"]({ t: "term.open", termId, cols: 80, rows: 24, signIn }, event => sent.push(event));
  await assert.rejects(open("sign-in-claude", "codex"), /does not match its provider/);
  await assert.rejects(open("sign-in-nobody", "nobody"), /Unknown provider/);
  await assert.rejects(terminalRoutes["term.open"]({ t: "term.open", termId: "sign-in-claude", cols: 80, rows: 24, signIn: "claude", instanceId: "pvi_other" }, event => sent.push(event)), /does not match its provider/);
  await assert.rejects(terminalRoutes["term.open"]({ t: "term.open", termId: "sign-in-claude-pvi_missing", cols: 80, rows: 24, signIn: "claude", instanceId: "pvi_missing" }, event => sent.push(event)), /account is unavailable/);
  assert.deepEqual(sent, []);
});
