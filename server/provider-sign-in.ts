import { execFile } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import type { ProviderSignIn } from "../shared/provider-settings.ts";
import { invocation, resolveCommand } from "./providers/binary.ts";
import { providers } from "./providers/index.ts";
import type { Provider } from "./providers/types.ts";

const STATUS_TIMEOUT = 15_000;

function statusOutput(provider: Provider): Promise<string> {
  const call = invocation(resolveCommand(provider.binary), provider.signIn.status);
  return new Promise((resolve, reject) => {
    execFile(call.file, call.args, { timeout: STATUS_TIMEOUT, windowsHide: true, windowsVerbatimArguments: call.verbatim }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== "number")) reject(error);
      else resolve(stripVTControlCharacters(`${stdout}\n${stderr}`));
    });
  });
}

async function signInStatus(provider: Provider): Promise<ProviderSignIn> {
  if (!resolveCommand(provider.binary).path) return { provider: provider.id };
  try {
    return { provider: provider.id, signedIn: provider.signIn.signedIn(await statusOutput(provider)) };
  } catch (error) {
    return { provider: provider.id, error: `Could not check sign-in: ${(error as Error).message}` };
  }
}

export function providerSignIns(): Promise<ProviderSignIn[]> {
  return Promise.all(Object.values(providers).map(signInStatus));
}

export function providerSignInCommand(provider: Provider): string {
  return [provider.binary, ...provider.signIn.login].join(" ");
}
