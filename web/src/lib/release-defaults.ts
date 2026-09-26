const APPLIED_KEY = "citropy.releaseDefaults";
const RELEASE_DEFAULTS_VERSION = "1";

export function applyReleaseDefaults(storage: Storage = localStorage): void {
  if (!(window.citropyDesktop ?? window.loomDesktop) || storage.getItem(APPLIED_KEY) === RELEASE_DEFAULTS_VERSION) return;
  storage.setItem("citropy.theme", "dark");
  storage.setItem("citropy.stageBackground", "ascii");
  storage.setItem(APPLIED_KEY, RELEASE_DEFAULTS_VERSION);
}
