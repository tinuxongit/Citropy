import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ICON_SIZE_DIRECTORY = "icons/hicolor/512x512/apps";
const NAME_HASH_LENGTH = 12;

export const dataDirectory = () => process.env.XDG_DATA_HOME || join(homedir(), ".local/share");

// Desktops cache icons by name for the whole session, so each new picture gets a new name.
export function refreshMenuIcon({ base, picturePath, data = dataDirectory() }) {
  const entry = join(data, "applications", `${base}.desktop`);
  if (!existsSync(entry)) return false;
  const picture = readFileSync(picturePath);
  const icon = `${base}-icon-${createHash("sha256").update(picture).digest("hex").slice(0, NAME_HASH_LENGTH)}`;
  const icons = join(data, ICON_SIZE_DIRECTORY);
  const text = readFileSync(entry, "utf8");
  const current = text.match(/^Icon=(.*)$/m);
  if (!current) throw new Error(`${entry} has no Icon line.`);
  if (current[1] === icon && existsSync(join(icons, `${icon}.png`))) return false;
  mkdirSync(icons, { recursive: true });
  writeFileSync(join(icons, `${icon}.png`), picture);
  writeFileSync(entry, text.replace(/^Icon=.*$/m, `Icon=${icon}`));
  for (const file of readdirSync(icons))
    if ((file === `${base}.png` || file.startsWith(`${base}-icon-`)) && file !== `${icon}.png`) unlinkSync(join(icons, file));
  spawnSync("gtk-update-icon-cache", ["-f", join(data, "icons/hicolor")], { stdio: "ignore" });
  if (spawnSync("kbuildsycoca6", ["--noincremental"], { stdio: "ignore" }).error)
    spawnSync("kbuildsycoca5", ["--noincremental"], { stdio: "ignore" });
  return true;
}
