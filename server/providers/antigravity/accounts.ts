import { rm } from "node:fs/promises";
import type { ProviderLaunch } from "../types.ts";
import { idleClient, startAgent } from "./acp.ts";
import { antigravityPaths } from "./paths.ts";
import { antigravityProfile, hasSignIn } from "./profile.ts";
import { stopAccountSessions } from "./session.ts";
import { cancelSignIn } from "./sign-in.ts";

export async function signOut(launch: ProviderLaunch): Promise<void> {
  cancelSignIn(launch);
  stopAccountSessions(launch.instanceId, "Signed out of Antigravity.");
  const profile = antigravityProfile(launch.instanceId);
  if (!await hasSignIn(profile)) return;
  const agent = await startAgent({
    instanceId: launch.instanceId,
    environment: launch.environment,
    cwd: profile.home,
    client: idleClient,
    onAuthorization: () => {},
    onFailure: () => {},
  });
  try {
    if (!agent.initialized.agentCapabilities?.auth?.logout) throw new Error("This Antigravity version cannot sign out.");
    await agent.connection.logout({});
  } finally {
    agent.stop();
  }
  await rm(profile.modelsPath, { force: true });
  if (await hasSignIn(profile)) throw new Error("Antigravity did not sign out.");
}

export async function removeAccount(instanceId: string): Promise<void> {
  cancelSignIn({ instanceId });
  stopAccountSessions(instanceId, "This Antigravity account was removed.");
  await rm(antigravityPaths.profile(instanceId), { recursive: true, force: true });
}
