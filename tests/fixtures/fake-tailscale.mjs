import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const file = process.env.FAKE_TAILSCALE_STATE;
const read = () => JSON.parse(readFileSync(file, "utf8"));
const write = (state) => writeFileSync(file, JSON.stringify(state));
const args = process.argv.slice(2);
const state = read();
write({ ...state, calls: [...state.calls, args.join(" ")] });

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (args[0] === "status") {
  if (!state.running) fail("failed to connect to local tailscaled; it doesn't appear to be running");
  process.stdout.write(JSON.stringify({ BackendState: state.backend, Self: { DNSName: state.dns } }));
} else if (args[0] === "serve" && args[1] === "status") {
  const key = `${state.dns.replace(/\.$/, "")}:443`;
  process.stdout.write(state.target ? JSON.stringify({ TCP: { 443: { HTTPS: true } }, Web: { [key]: { Handlers: { "/": { Proxy: state.target } } } } }) : "{}");
} else if (args[0] === "serve" && args.at(-1) === "off") {
  write({ ...read(), target: undefined });
} else if (args[0] === "serve" && args[1] === "--bg") {
  if (state.denied) fail("Access denied: serve config denied");
  if (!state.approved) {
    process.stdout.write("Serve is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=fake\n");
    while (!read().approved) await sleep(25);
  }
  write({ ...read(), target: args.at(-1) });
  process.stdout.write("Available within your tailnet\n");
} else if (args[0] === "set") {
  write({ ...read(), denied: false });
} else {
  fail(`Unexpected command: ${args.join(" ")}`);
}
