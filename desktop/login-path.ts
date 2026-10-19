import { execFile } from "node:child_process";
import { promisify } from "node:util";

const MARKER = "__CITROPY_PATH__";

/**
 * Apps opened from the Dock or an app menu get a bare PATH, so CLIs installed through nvm, Volta,
 * pnpm, mise or Claude's own installer look missing. Ask the login shell for the PATH a terminal
 * would have, as VS Code does, and put it ahead of the inherited one.
 */
export async function applyLoginShellPath(env: NodeJS.ProcessEnv): Promise<void> {
  if (process.platform === "win32" || !env.SHELL) return;
  // The markers skip whatever the shell's startup files print around the value.
  const { stdout } = await promisify(execFile)(
    env.SHELL,
    ["-ilc", `printf '${MARKER}%s${MARKER}' "$PATH"`],
    { env, timeout: 5000, encoding: "utf8" },
  );
  const shell = stdout.split(MARKER)[1]?.split(":").filter(Boolean);
  if (!shell?.length) throw new Error(`${env.SHELL} printed no PATH`);
  const inherited = (env.PATH ?? "").split(":").filter(Boolean);
  env.PATH = [...new Set([...shell, ...inherited])].join(":");
}
