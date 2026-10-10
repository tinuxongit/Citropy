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

type Launch = ReturnType<typeof resolveProviderAccount>["launch"];

function accounts(provider: Provider): Array<string | undefined> {
  return [undefined, ...[...store.providerInstances.values()].filter(instance => instance.provider === provider.id).map(instance => instance.id)];
}

function statusOutput(binary: string, signIn: TerminalSignIn, launch: Launch): Promise<string> {
  const call = invocation(resolveCommand(binary), signIn.status);
  return new Promise((resolve, reject) => {
    execFile(call.file, call.args, { timeout: STATUS_TIMEOUT, windowsHide: true, windowsVerbatimArguments: call.verbatim, env: { ...process.env, ...launch.environment } }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== "number")) reject(error);
      else resolve(stripVTControlCharacters(`${stdout}\n${stderr}`));
    });
  });
}

async function terminalStatus(provider: Provider, signIn: TerminalSignIn, launch: Launch): Promise<{ signedIn?: boolean; error?: string }> {
  const binary = launch.binary ?? provider.binary;
  if (!resolveCommand(binary).path) return {};
  try {
    return { signedIn: signIn.signedIn(await statusOutput(binary, signIn, launch)) };
  } catch (error) {
    return { error: `Could not check sign-in: ${(error as Error).message}` };
  }
}

function accountStatus(provider: Provider, launch: Launch) {
  return provider.signIn.kind === "terminal" ? terminalStatus(provider, provider.signIn, launch) : provider.signIn.status(launch);
}

export function providerSignIns(): Promise<ProviderSignIn[]> {
  return Promise.all(Object.values(providers).flatMap(provider => accounts(provider).map(async instanceId => ({
    provider: provider.id,
    ...(instanceId ? { instanceId } : {}),
    ...await accountStatus(provider, resolveProviderAccount(provider.id, instanceId).launch),
  }))));
}

export function providerSignInCommand(provider: Provider, launch: Launch): string {
  if (provider.signIn.kind !== "terminal") throw new Error(`${provider.label} signs in from Settings > Providers.`);
  return [launch.binary ?? provider.binary, ...provider.signIn.login].join(" ");
}

export function appSignIn(providerId: ProviderId, instanceId?: string): { signIn: AppSignIn; launch: Launch } {
  const provider = providers[providerId];
  if (provider.signIn.kind !== "app") throw new Error(`${provider.label} signs in from a terminal.`);
  return { signIn: provider.signIn, launch: resolveProviderAccount(providerId, instanceId).launch };
}

export function startAppSignIn(providerId: ProviderId, instanceId?: string) {
  const { signIn, launch } = appSignIn(providerId, instanceId);
  return signIn.start(launch, () => void refreshProvidersNow());
}
