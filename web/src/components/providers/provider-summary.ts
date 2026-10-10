import type { ProviderInfo } from "../../../../shared/protocol.ts";
import type { ProviderMaintenance, ProviderSignIn } from "../../../../shared/provider-settings.ts";
import { activeAccountId } from "../../../../shared/provider-account.ts";
import { signInFor } from "./use-provider-sign-ins.ts";

export const MAIN_ACCOUNT = "Main account";

const VERSION_NUMBER = /\d+(?:\.\d+)+[\w.+-]*/;

export const isInstalled = (provider: ProviderInfo) => provider.available || Boolean(provider.instances?.some(entry => entry.available));

export function versionSummary(provider: ProviderInfo, state: ProviderMaintenance | undefined): string {
  if (!isInstalled(provider)) return "Not installed";
  const version = state?.version ?? provider.version;
  const parts = [version ? `Version ${VERSION_NUMBER.exec(version)?.[0] ?? version}` : "Version not detected"];
  if (state?.updateStatus === "current") parts.push("Up to date");
  if (state?.updateStatus === "available") parts.push(`${state.latestVersion ?? "A new version"} available`);
  return parts.join(" · ");
}

export function accountSummary(provider: ProviderInfo, signIns: ProviderSignIn[]): string {
  if (!isInstalled(provider)) return "Install it to use it in chats.";
  if (!provider.enabled) return "Off. Not offered in new chats.";
  const ids = [undefined, ...(provider.instances ?? []).map(instance => instance.id)];
  const statuses = ids.map(id => signInFor(signIns, provider.id, id));
  if (statuses.some(status => !status)) return "Checking sign-in…";
  const signedIn = statuses.filter(status => status?.signedIn).length;
  if (ids.length > 1) return `Using ${activeAccountName(provider)} · ${signedIn === ids.length ? "all" : signedIn} of ${ids.length} signed in`;
  if (!signedIn) return "Not signed in";
  return provider.models.length === 1 ? "Signed in · 1 model" : `Signed in · ${provider.models.length} models`;
}

function activeAccountName(provider: ProviderInfo): string {
  const id = activeAccountId(provider);
  return id ? provider.instances?.find(instance => instance.id === id)?.name ?? id : MAIN_ACCOUNT;
}
