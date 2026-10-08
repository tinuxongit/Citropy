import { mkdirSync, writeFileSync, chmodSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDirectory, refreshMenuIcon } from "./menu-icon.mjs";

if (process.platform !== "linux")
  throw new Error(
    "Use npm run desktop on this platform. The application-menu installer currently supports Linux.",
  );
const root = fileURLToPath(new URL("..", import.meta.url));
const data = dataDirectory();
const directory = join(data, "applications");
mkdirSync(directory, { recursive: true });
const quote = (value) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("`", "\\`").replaceAll("$", "\\$").replaceAll("%", "%%")}"`;
const development = process.argv.includes("--dev");
const name = development ? "Citropy Dev" : "Citropy";
const mode = development ? " --dev" : "";
const base = development ? "citropy-dev" : "citropy";
const path = join(directory, `${base}.desktop`);
writeFileSync(
  path,
  `[Desktop Entry]\nType=Application\nName=${name}\nComment=Your workspace for AI conversations and code\nExec=${quote(process.execPath)} ${quote(join(root, "desktop/start.mjs"))}${mode}\nPath=${root}\nIcon=${base}\nTerminal=false\nCategories=Development;IDE;\nStartupWMClass=${name}\n`,
  { mode: 0o755 },
);
chmodSync(path, 0o755);
refreshMenuIcon({ base, picturePath: join(root, "desktop/assets", `${base}.png`), data });
const previous = join(directory, "loom.desktop");
if (existsSync(previous) && readFileSync(previous, "utf8").includes(join(root, "desktop/start.mjs")))
  unlinkSync(previous);
spawnSync("update-desktop-database", [directory], { stdio: "ignore" });
console.log(`Installed ${name} in your application menu: ${path}`);
