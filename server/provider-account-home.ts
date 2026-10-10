import { mkdir, rm, stat, symlink } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { ifMissing } from "../shared/expected-errors.mjs";
import type { ProviderInstance } from "../shared/protocol.ts";
import { uid } from "./ids.ts";
import { dataRoot } from "./paths.ts";
import { providers } from "./providers/index.ts";

type AccountInput = Omit<ProviderInstance, "id"> & { id?: string };

const root = join(dataRoot, "provider-accounts");

function accountHome(provider: ProviderInstance["provider"]) {
  const signIn = providers[provider]?.signIn;
  return signIn?.kind === "terminal" ? signIn.home : undefined;
}

function managedFolder(instance: ProviderInstance): string | undefined {
  const variable = accountHome(instance.provider)?.variable;
  const folder = variable ? instance.environment[variable] : undefined;
  if (!folder) return undefined;
  const inside = relative(root, folder);
  return inside && !inside.startsWith("..") && !isAbsolute(inside) ? folder : undefined;
}

export function withAccountHome<T extends AccountInput>(input: T): T {
  const home = accountHome(input.provider);
  if (input.id || !home || !input.environment || typeof input.environment !== "object" || input.environment[home.variable]) return input;
  return { ...input, environment: { ...input.environment, [home.variable]: join(root, uid(input.provider)) } };
}

export async function prepareAccountHome(instance: ProviderInstance): Promise<void> {
  const folder = managedFolder(instance);
  if (!folder) return;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const shared = accountHome(instance.provider)?.shared;
  if (!shared) return;
  const from = shared.from();
  for (const item of shared.items) {
    const source = join(from, item);
    const found = await stat(source).catch(ifMissing(undefined));
    if (!found || await stat(join(folder, item)).catch(ifMissing(undefined))) continue;
    await symlink(source, join(folder, item), found.isDirectory() ? "junction" : "file");
  }
}

export async function removeAccountHome(instance: ProviderInstance): Promise<void> {
  const folder = managedFolder(instance);
  if (folder) await rm(folder, { recursive: true, force: true });
}
