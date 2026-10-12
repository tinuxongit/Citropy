import semver from "semver";
import { androidApkName, appRepository, appVersion } from "../../shared/release.mjs";

const SETTINGS = {
  checkEveryMs: 24 * 60 * 60 * 1000,
  timeoutMs: 4000,
};

const CHECKED_KEY = "citropy.updateChecked";

export interface AppUpdate {
  version: string;
  url: string;
}

interface Release {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

async function latestRelease(): Promise<Release | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${appRepository}/releases/latest`, { signal: AbortSignal.timeout(SETTINGS.timeoutMs) });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} when checking for app updates.`);
    return await response.json();
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")) return undefined;
    throw error;
  }
}

export async function availableUpdate(): Promise<AppUpdate | undefined> {
  if (Date.now() - Number(localStorage.getItem(CHECKED_KEY)) < SETTINGS.checkEveryMs) return undefined;
  const release = await latestRelease();
  if (!release) return undefined;
  localStorage.setItem(CHECKED_KEY, String(Date.now()));
  const version = semver.clean(release.tag_name);
  const apk = release.assets.find((asset) => asset.name === androidApkName);
  if (!version || !apk || !semver.gt(version, appVersion)) return undefined;
  return { version, url: apk.browser_download_url };
}
