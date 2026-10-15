import { commandVersion } from "../binary.ts";
import { MUSE_HOME_VARIABLE } from "../config-folders.ts";
import type { Provider } from "../types.ts";
import { MUSE_BINARY, NO_AUTO_UPDATE } from "./host.ts";
import { listMuseModels } from "./models.ts";
import { MuseSession } from "./session.ts";
import { museSignedIn } from "./sign-in.ts";
import { museVersion } from "./version.ts";

export const museProvider: Provider = {
  id: "muse",
  label: "Muse Code",
  binary: MUSE_BINARY,
  supportsPermissionPrompt: true,
  capabilities: { transport: "stdio", steer: true, compact: true, stopShell: true },
  steerHint: "Muse Code adds it to the turn in progress.",
  signIn: { kind: "terminal", login: ["login"], credentials: museSignedIn, home: { variable: MUSE_HOME_VARIABLE } },
  models: [],
  listModels: listMuseModels,
  async detect(launch) {
    const output = await commandVersion(launch?.binary ?? MUSE_BINARY, undefined, { ...launch?.environment, ...NO_AUTO_UPDATE });
    const version = output ? museVersion(output) : undefined;
    return { available: Boolean(version), version };
  },
  start: options => new MuseSession(options),
};
