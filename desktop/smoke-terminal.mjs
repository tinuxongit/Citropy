import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const marker = "citropy-terminal-ready";

export async function checkPackagedTerminal(executable, appRoot, env = {}) {
  const script = `
    const pty = require(${JSON.stringify(join(appRoot, "node_modules/node-pty"))});
    const windows = process.platform === "win32";
    const terminal = pty.spawn(windows ? "cmd.exe" : "/bin/sh", windows ? ["/c", "echo ${marker}"] : ["-c", "echo ${marker}"], { cols: 80, rows: 24 });
    let output = "";
    terminal.onData((data) => { output += data; });
    terminal.onExit(({ exitCode }) => {
      console.log(JSON.stringify({ exitCode, output }));
      process.exit(0);
    });
  `;
  const { stdout } = await promisify(execFile)(executable, ["-e", script], {
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1" },
    timeout: 30000,
  });
  const result = JSON.parse(stdout.trim().split("\n").at(-1));
  assert.equal(result.exitCode, 0, `The packaged terminal exited with ${result.exitCode}: ${result.output}`);
  assert.match(result.output, new RegExp(marker), "The packaged terminal did not run its command.");
}
