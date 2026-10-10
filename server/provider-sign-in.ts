import { execFile } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import type { ProviderSignIn } from "../shared/provider-settings.ts";
import type { ProviderId } from "../shared/protocol.ts";
import { invocation, resolveCommand } from "./providers/binary.ts";
import { providers } from "./providers/index.ts";
import { resolveProviderAccount } from "./provider-account.ts";
import { refreshProvidersNow } from "./provider-registry.ts";
import { store } from "./store.ts";
import type { AppSignIn, Provider, TerminalSignIn } from "./providers/types.ts";

const STATUS_TIMEOUT = 15_000;

function statusOutput(provider: Provider, signIn: TerminalSignIn): Promise<string> {
  const call = invocation(resolveCommand(provider.binary), signIn.status);
  return new Promise((resolve, reject) => {
    execFile(call.file, call.args, { timeout: STATUS_TIMEOUT, windowsHide: true, windowsVerbatimArguments: call.verbatim }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== "number")) reject(error);
      else resolve(stripVTControlCharacters(`${stdout}\n${stderr}`));
    });
  });
}

async function terminalStatus(provider: Provider, signIn: TerminalSignIn): Promise<ProviderSignIn> {
  if (!resolveCommand(provider.binary).path) return { provider: provider.id };
  try {
    return { provider: provider.id, signedIn: signIn.signedIn(await statusOutput(provider, signIn)) };
  } catch (error) {
    return { provider: provider.id, error: `Could not check sign-in: ${(error as Error).message}` };
  }
}

function appStatuses(provider: Provider, signIn: AppSignIn): Promise<ProviderSignIn[]> {
  const accounts = [undefined, ...[...store.providerInstances.values()].filter(instance => instance.provider === provider.id).map(instance => instance.id)];
  return Promise.all(accounts.map(async instanceId => ({
    provider: provider.id,
    ...(instanceId ? { instanceId } : {}),
    ...await signIn.status(resolveProviderAccount(provider.id, instanceId).launch),
  })));
}

export async function providerSignIns(only: ProviderId[] = []): Promise<ProviderSignIn[]> {
  const chosen = Object.values(providers).filter(provider => !only.length || only.includes(provider.id));
  const statuses = await Promise.all(chosen.map(provider =>
    provider.signIn.kind === "terminal" ? terminalStatus(provider, provider.signIn).then(status => [status]) : appStatuses(provider, provider.signIn)));
  return statuses.flat();
}

export function providerSignInCommand(provider: Provider): string {
  if (provider.signIn.kind !== "terminal") throw new Error(`${provider.label} signs in from Settings > Providers.`);
  return [provider.binary, ...provider.signIn.login].join(" ");
}

export function appSignIn(providerId: ProviderId, instanceId?: string): { signIn: AppSignIn; launch: ReturnType<typeof resolveProviderAccount>["launch"] } {
  const provider = providers[providerId];
  if (provider.signIn.kind !== "app") throw new Error(`${provider.label} signs in from a terminal.`);
  return { signIn: provider.signIn, launch: resolveProviderAccount(providerId, instanceId).launch };
}

export function startAppSignIn(providerId: ProviderId, instanceId?: string) {
  const { signIn, launch } = appSignIn(providerId, instanceId);
  return signIn.start(launch, () => void refreshProvidersNow());
}
