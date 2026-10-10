import { join } from "node:path";
import { dataRoot } from "../../paths.ts";

const root = join(dataRoot, "antigravity");

export const antigravityPaths = {
  installRecord: join(root, "install.json"),
  versions: join(root, "versions"),
  downloads: join(root, "downloads"),
  temp: join(root, "tmp"),
  profile(instanceId: string | undefined): string {
    const name = instanceId ?? "default";
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error("This Antigravity account has an invalid id.");
    return join(root, "profiles", name);
  },
};
