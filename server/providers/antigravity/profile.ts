import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { ifMissing } from "../../../shared/expected-errors.mjs";
import { delimiter, join } from "node:path";
import { antigravityPaths } from "./paths.ts";
import type { AntigravityInstallation } from "./install.ts";

export const AUTH_URL_MARKER = "__CITROPY_ANTIGRAVITY_AUTH_URL__";
const BROWSER_SCRIPT = `process.stderr.on("error",()=>process.exit(0)).write("${AUTH_URL_MARKER}"+JSON.stringify(process.argv[1])+"\\n",()=>process.exit(0))`;
const PROFILE_SETTINGS = { auth: { type: "oauth-personal" } };
const INHERITED_CREDENTIALS = new Set([
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_QUOTA_PROJECT",
  "GOOGLE_GENAI_USE_VERTEXAI",
  "GCLOUD_PROJECT",
  "CLOUDSDK_CORE_PROJECT",
  "AGY_ACP_CCPA_PROJECT",
  "AGY_ACP_ENABLE_OAUTH",
  "GEMINI_HOME",
  "AGY_ACP_FORCE_FILE_STORAGE",
  "ANTIGRAVITY_HARNESS_PATH",
  "BROWSER",
  "PYTHONUNBUFFERED",
  "ELECTRON_RUN_AS_NODE",
]);

export interface AntigravityProfile {
  home: string;
  tokenPath: string;
  modelsPath: string;
}

export function antigravityProfile(instanceId: string | undefined): AntigravityProfile {
  const home = antigravityPaths.profile(instanceId);
  return {
    home,
    tokenPath: join(home, "antigravity-acp", "acp_token.json"),
    modelsPath: join(home, "citropy-models.json"),
  };
}

export async function hasSignIn(profile: AntigravityProfile): Promise<boolean> {
  return Boolean(await stat(profile.tokenPath).catch(ifMissing(undefined)));
}

export async function prepareProfile(profile: AntigravityProfile): Promise<void> {
  const settings = join(profile.home, "antigravity-acp");
  for (const folder of [profile.home, settings]) {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(folder, 0o700);
  }
  await writeFile(join(settings, "settings.json"), `${JSON.stringify(PROFILE_SETTINGS)}\n`, { mode: 0o600 });
}

let staleTempRemoved: Promise<void> | undefined;

export async function temporaryFolder(): Promise<string> {
  staleTempRemoved ??= rm(antigravityPaths.temp, { recursive: true, force: true });
  await staleTempRemoved;
  await mkdir(antigravityPaths.temp, { recursive: true, mode: 0o700 });
  return mkdtemp(join(antigravityPaths.temp, "run-"));
}

function quote(part: string): string {
  return `'${part.replaceAll("'", `'"'"'`)}'`;
}

function browserCommand(): string {
  const executable = process.platform === "win32" ? process.execPath.replaceAll("\\", "/") : process.execPath;
  const command = [executable, "-e", BROWSER_SCRIPT, "--", "%s"].map(quote).join(" ");
  // Why: Python splits BROWSER on the path delimiter before it reads any quotes.
  if (command.includes(delimiter) || /[\r\n\0]|%s/.test(executable))
    throw new Error(`Antigravity cannot start from a Citropy folder whose path contains "${delimiter}". Move Citropy to another folder.`);
  return command;
}

export function launchEnvironment(installation: AntigravityInstallation, profile: AntigravityProfile, temp: string, account: Record<string, string> = {}): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...account }))
    if (value !== undefined && !INHERITED_CREDENTIALS.has(key.toUpperCase())) environment[key] = value;
  return {
    ...environment,
    GEMINI_HOME: profile.home,
    AGY_ACP_FORCE_FILE_STORAGE: "1",
    ANTIGRAVITY_HARNESS_PATH: installation.harness,
    BROWSER: browserCommand(),
    PYTHONUNBUFFERED: "1",
    ELECTRON_RUN_AS_NODE: "1",
    ...(process.platform === "win32" ? { TEMP: temp, TMP: temp } : { TMPDIR: temp }),
  };
}
