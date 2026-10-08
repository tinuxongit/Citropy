import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { refreshMenuIcon } from "../desktop/menu-icon.mjs";

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "citropy-menu-icon-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const data = join(directory, "data");
  const icons = join(data, "icons/hicolor/512x512/apps");
  const entry = join(data, "applications/citropy.desktop");
  await mkdir(icons, { recursive: true });
  await mkdir(join(data, "applications"));
  await writeFile(join(icons, "citropy.png"), "old-icon");
  await writeFile(join(icons, "citropy-dev.png"), "dev-icon");
  await writeFile(entry, "[Desktop Entry]\nName=Citropy\nIcon=citropy\nTerminal=false\n");
  const picturePath = join(directory, "bundled.png");
  return { data, icons, entry, picturePath };
}

const iconName = async (entry) => (await readFile(entry, "utf8")).match(/^Icon=(.+)$/m)[1];

test("each new picture gets a new icon name and replaces the old file", async (t) => {
  const { data, icons, entry, picturePath } = await setup(t);
  await writeFile(picturePath, "first");
  assert.equal(refreshMenuIcon({ base: "citropy", picturePath, data }), true);
  const first = await iconName(entry);
  assert.match(first, /^citropy-icon-[0-9a-f]{12}$/);
  assert.deepEqual((await readdir(icons)).sort(), ["citropy-dev.png", `${first}.png`]);
  assert.equal(await readFile(join(icons, `${first}.png`), "utf8"), "first");
  assert.match(await readFile(entry, "utf8"), /^Name=Citropy$/m);

  assert.equal(refreshMenuIcon({ base: "citropy", picturePath, data }), false);

  await writeFile(picturePath, "second");
  assert.equal(refreshMenuIcon({ base: "citropy", picturePath, data }), true);
  const second = await iconName(entry);
  assert.notEqual(second, first);
  assert.deepEqual((await readdir(icons)).sort(), ["citropy-dev.png", `${second}.png`]);
});

test("nothing changes without a menu entry", async (t) => {
  const { data, icons, entry, picturePath } = await setup(t);
  await rm(entry);
  await writeFile(picturePath, "first");
  assert.equal(refreshMenuIcon({ base: "citropy", picturePath, data }), false);
  assert.deepEqual((await readdir(icons)).sort(), ["citropy-dev.png", "citropy.png"]);
});

test("a menu entry without an Icon line is reported", async (t) => {
  const { data, entry, picturePath } = await setup(t);
  await writeFile(entry, "[Desktop Entry]\nName=Citropy\n");
  await writeFile(picturePath, "first");
  assert.throws(() => refreshMenuIcon({ base: "citropy", picturePath, data }), /has no Icon line/);
});
