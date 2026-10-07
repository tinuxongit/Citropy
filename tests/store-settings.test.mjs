import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "citropy-store-settings-"));
const settingsFile = join(directory, "settings.json");
const unreadable = "{";
writeFileSync(settingsFile, unreadable);
process.env.CITROPY_DATA_DIR = directory;

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

test("an unreadable settings file stops startup and is left untouched", async () => {
  await assert.rejects(import("../server/store.ts"), (error) => /settings\.json/.test(error.message) && error.cause instanceof SyntaxError);
  assert.equal(readFileSync(settingsFile, "utf8"), unreadable);
});
