import type { Provider } from "../types.ts";
import { removeAccount, signOut } from "./accounts.ts";
import { antigravityInstallation } from "./install.ts";
import { accountModels } from "./models.ts";
import { antigravityProfile, hasSignIn } from "./profile.ts";
import { AntigravitySession } from "./session.ts";
import { cancelSignIn, completeSignIn, signInFlow, startSignIn } from "./sign-in.ts";

export const antigravityProvider: Provider = {
  id: "antigravity",
  label: "Antigravity",
  binary: "antigravity",
  supportsPermissionPrompt: true,
  capabilities: { transport: "stdio", steer: false, compact: false, stopShell: false },
  signIn: {
    kind: "app",
    status: async launch => ({ signedIn: await hasSignIn(antigravityProfile(launch.instanceId)), flow: signInFlow(launch) }),
    start: startSignIn,
    complete: completeSignIn,
    cancel: cancelSignIn,
    signOut,
  },
  removeAccount,
  models: [],
  listModels: accountModels,
  async detect() {
    const installation = await antigravityInstallation();
    return { available: Boolean(installation), version: installation?.version };
  },
  start: options => new AntigravitySession(options),
};
