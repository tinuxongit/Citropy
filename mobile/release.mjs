import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { androidApkName } from "../shared/release.mjs";

const android = new URL("android/", import.meta.url);
const releaseFolder = new URL("../release/", import.meta.url);

execFileSync("./gradlew", ["assembleRelease"], { cwd: android, stdio: "inherit" });
mkdirSync(releaseFolder, { recursive: true });
copyFileSync(new URL("app/build/outputs/apk/release/app-release.apk", android), new URL(androidApkName, releaseFolder));
