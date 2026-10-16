import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ifMissing } from "../../../shared/expected-errors.mjs";
import { museHome } from "../config-folders.ts";
import type { ProviderLaunch } from "../types.ts";
import { MUSE_PROVIDER, museEnvironment } from "./host.ts";

const API_KEY_VARIABLE = "META_API_KEY";
const CREDENTIALS = "auth.json";

export async function museSignedIn(launch: ProviderLaunch): Promise<boolean> {
  const environment = museEnvironment(launch);
  if (environment[API_KEY_VARIABLE]) return true;
  const raw = await readFile(join(museHome(environment), CREDENTIALS), "utf8").catch(
    ifMissing(undefined),
  );
  if (raw === undefined) return false;
  const credentials = JSON.parse(raw) as { providers?: Record<string, unknown> };
  return Boolean(credentials.providers?.[MUSE_PROVIDER]);
}
